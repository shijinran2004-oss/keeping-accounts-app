package com.shijinran.money.capture;

import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.Process;
import android.app.AppOpsManager;
import android.provider.Settings;
import android.util.Log;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import com.shijinran.money.MainActivity;

/**
 * 截屏后从屏幕顶部滑下来的卡片，像 QQ 收到消息那样，不用下拉通知栏。
 *
 * 系统的 heads-up 横幅由厂商决定给不给（很多 ROM 默认把「悬浮通知」关掉），
 * 这里自己画一个 TYPE_APPLICATION_OVERLAY 的窗口，只要用户允许「显示在其他应用上层」，
 * 不管停在哪都能立刻看到金额和两个按钮。
 */
public final class CaptureOverlay {

    /** 没人理就自己收起来；通知还留在通知栏里，随时可以点。 */
    private static final long AUTO_HIDE_MS = 15_000L;

    private static final int CARD_BG = 0xFFFFFFFF;
    private static final int INK = 0xFF1A1713;
    private static final int MUTE = 0xFF8A8F98;
    private static final int ACCENT = 0xFFC2563B;
    private static final int CANCEL_INK = 0xFF6F6A62;
    private static final int THUMB_BG = 0xFFF3EDE1;

    private static final Handler UI = new Handler(Looper.getMainLooper());
    private static CaptureOverlay current;

    private final Context context;
    private final long key;
    private final int notifyId;
    private final String path;

    private WindowManager windowManager;
    private View card;
    private TextView titleView;
    private TextView subtitleView;
    private TextView confirmView;
    private long amountCents;
    private String ocrText = "";

    private final Runnable hideTask = new Runnable() {
        @Override
        public void run() {
            dismiss();
        }
    };

    private CaptureOverlay(Context context, long key, int notifyId, String path) {
        this.context = context.getApplicationContext();
        this.key = key;
        this.notifyId = notifyId;
        this.path = path;
    }

    /** 有「显示在其他应用上层」权限才能画这块卡片 */
    public static boolean permitted(Context context) {
        if (context == null) return false;
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true;
        try {
            if (!Settings.canDrawOverlays(context)) return false;
            // canDrawOverlays() 只看清单里的权限项，真正的开关在 appops 里：
            // 小米这类 ROM 上两者会不一致（系统设置里关掉后 canDrawOverlays 仍为 true），
            // 结果是 addView 被系统拒绝、卡片一张都不出现，用户还以为功能坏了。
            AppOpsManager ops = (AppOpsManager) context.getSystemService(Context.APP_OPS_SERVICE);
            if (ops != null) {
                int mode = ops.checkOpNoThrow(AppOpsManager.OPSTR_SYSTEM_ALERT_WINDOW,
                        android.os.Process.myUid(), context.getPackageName());
                return mode == AppOpsManager.MODE_ALLOWED;
            }
            return true;
        } catch (Throwable t) {
            return false;
        }
    }

    public static Intent permissionIntent(Context context) {
        Intent intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:" + context.getPackageName()));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return intent;
    }

    /** 刚截到图、还没认出金额：先把卡片滑下来，别让人等 OCR */
    public static void showProgress(Context context, long key, int notifyId, String path, Bitmap thumb) {
        if (!permitted(context)) return;
        final Bitmap preview = thumb;
        UI.post(new Runnable() {
            @Override
            public void run() {
                // 先把上一张收掉再挂新的。这里不能调 dismiss()：它自己还会再 post 一次，
                // 等它跑到时 current 已经是新卡片，会把刚挂上的这张立刻收掉（看不见卡片）。
                CaptureOverlay old = current;
                current = null;
                if (old != null) old.dismissSelf();
                try {
                    CaptureOverlay overlay = new CaptureOverlay(context, key, notifyId, path);
                    overlay.attach(preview);
                    current = overlay;
                } catch (Throwable t) {
                    Log.w("SnoopyCapture", "overlay attach failed", t);
                }
            }
        });
    }

    /** 认出金额：原地把「正在认金额…」换成金额，并把「确认记录」点亮 */
    public static void showAmount(final String amount, final long amountCents, final String text) {
        UI.post(new Runnable() {
            @Override
            public void run() {
                CaptureOverlay overlay = current;
                if (overlay == null) return;
                overlay.amountCents = amountCents;
                overlay.ocrText = text == null ? "" : text;
                overlay.titleView.setText("识别到 ¥" + amount);
                overlay.subtitleView.setText("点「确认记录」直接记一笔，不用打开 App");
                overlay.confirmView.setAlpha(1f);
                overlay.confirmView.setEnabled(true);
                overlay.restartTimer();
            }
        });
    }

    /**
     * 卡片是不是真的显示在屏幕上了。
     * 有些国产 ROM（小米/HyperOS 等）会拦掉后台应用的悬浮窗：addView 不报错、
     * 视图对象也在，但用户屏幕上什么都没有。调用方据此决定要不要退回系统横幅，
     * 否则就会出现「截了图，卡片被拦、通知又是静音的，用户以为没反应」。
     */
    static boolean isShowing() {
        CaptureOverlay overlay = current;
        return overlay != null && overlay.card != null
                && overlay.card.getWindowToken() != null && overlay.card.isShown();
    }

    /** 这张截图被挤掉 / 取消时，顺手把它的卡片也收起来 */
    public static void dismissIfKey(final long key) {
        UI.post(new Runnable() {
            @Override
            public void run() {
                if (current != null && current.key == key) current.dismissSelf();
            }
        });
    }

    public static void dismiss() {
        UI.post(new Runnable() {
            @Override
            public void run() {
                if (current != null) current.dismissSelf();
            }
        });
    }

    private void attach(Bitmap thumbBmp) {
        windowManager = (WindowManager) context.getSystemService(Context.WINDOW_SERVICE);
        if (windowManager == null) return;

        LinearLayout root = new LinearLayout(context);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(16), dp(14), dp(16), dp(12));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(CARD_BG);
        bg.setCornerRadius(dp(18));
        root.setBackground(bg);
        root.setElevation(dp(10));

        LinearLayout row = new LinearLayout(context);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);

        ImageView icon = new ImageView(context);
        int side = dp(44);
        LinearLayout.LayoutParams iconLp = new LinearLayout.LayoutParams(side, side);
        iconLp.setMarginEnd(dp(12));
        icon.setLayoutParams(iconLp);
        icon.setScaleType(ImageView.ScaleType.CENTER_CROP);
        GradientDrawable round = new GradientDrawable();
        round.setColor(THUMB_BG);
        round.setCornerRadius(dp(10));
        icon.setBackground(round);
        icon.setClipToOutline(true);
        if (thumbBmp != null) icon.setImageBitmap(thumbBmp);
        row.addView(icon);

        LinearLayout texts = new LinearLayout(context);
        texts.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams textsLp = new LinearLayout.LayoutParams(0,
                LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        texts.setLayoutParams(textsLp);

        titleView = new TextView(context);
        titleView.setText("正在认金额…");
        titleView.setTextColor(INK);
        titleView.setTextSize(16f);
        titleView.setTypeface(null, android.graphics.Typeface.BOLD);
        titleView.setMaxLines(1);
        titleView.setEllipsize(android.text.TextUtils.TruncateAt.END);
        texts.addView(titleView);

        subtitleView = new TextView(context);
        subtitleView.setText("截图记账正在读这张截图，马上就好");
        subtitleView.setTextColor(MUTE);
        subtitleView.setTextSize(12f);
        subtitleView.setMaxLines(1);
        subtitleView.setEllipsize(android.text.TextUtils.TruncateAt.END);
        LinearLayout.LayoutParams subLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        subLp.topMargin = dp(3);
        subtitleView.setLayoutParams(subLp);
        texts.addView(subtitleView);
        row.addView(texts);
        root.addView(row);

        LinearLayout buttons = new LinearLayout(context);
        buttons.setOrientation(LinearLayout.HORIZONTAL);
        buttons.setGravity(Gravity.END);
        LinearLayout.LayoutParams buttonsLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        buttonsLp.topMargin = dp(10);
        buttons.setLayoutParams(buttonsLp);

        TextView cancel = new TextView(context);
        cancel.setText("取消");
        cancel.setTextColor(CANCEL_INK);
        cancel.setTextSize(13f);
        cancel.setGravity(Gravity.CENTER);
        cancel.setPadding(dp(14), dp(8), dp(14), dp(8));
        cancel.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                try {
                    CaptureCancelReceiver.cancelShot(context, key, notifyId);
                } catch (Throwable ignored) {
                }
                dismissSelf();
            }
        });
        buttons.addView(cancel);

        confirmView = new TextView(context);
        confirmView.setText("确认记录");
        confirmView.setTextColor(0xFFFFFFFF);
        confirmView.setTextSize(13f);
        confirmView.setGravity(Gravity.CENTER);
        confirmView.setPadding(dp(16), dp(8), dp(16), dp(8));
        GradientDrawable pill = new GradientDrawable();
        pill.setColor(ACCENT);
        pill.setCornerRadius(dp(18));
        confirmView.setBackground(pill);
        confirmView.setEnabled(false);
        confirmView.setAlpha(0.45f);
        LinearLayout.LayoutParams confirmLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        confirmLp.setMarginStart(dp(8));
        confirmView.setLayoutParams(confirmLp);
        confirmView.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (amountCents <= 0) return;
                try {
                    CaptureCancelReceiver.recordShot(context, key, notifyId, amountCents, ocrText);
                } catch (Throwable ignored) {
                }
                dismissSelf();
            }
        });
        buttons.addView(confirmView);
        root.addView(buttons);

        // 点卡片本身：打开记一笔，把这张图带进去
        root.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                try {
                    Intent intent = new Intent(context, MainActivity.class);
                    intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                    if (path != null) intent.putExtra(CapturePlugin.EXTRA_PENDING, path);
                    context.startActivity(intent);
                } catch (Throwable ignored) {
                }
                dismissSelf();
            }
        });

        card = root;
        WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
                WindowManager.LayoutParams.MATCH_PARENT,
                WindowManager.LayoutParams.WRAP_CONTENT,
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                        ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                        : WindowManager.LayoutParams.TYPE_PHONE,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                        | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
                android.graphics.PixelFormat.TRANSLUCENT);
        lp.gravity = Gravity.TOP | Gravity.CENTER_HORIZONTAL;
        lp.y = dp(26);
        windowManager.addView(card, lp);

        card.setAlpha(0f);
        card.setTranslationY(-dp(90));
        card.animate().alpha(1f).translationY(0f).setDuration(220).start();
        restartTimer();
    }

    private void restartTimer() {
        UI.removeCallbacks(hideTask);
        UI.postDelayed(hideTask, AUTO_HIDE_MS);
    }

    private void dismissSelf() {
        UI.removeCallbacks(hideTask);
        if (current == this) current = null;
        // 动画结束时字段已经被清空，所以先把 View 和 WindowManager 抓成局部变量，
        // 否则 withEndAction 里看到的是 null，窗口就永远留在屏幕上了
        final View view = card;
        final WindowManager wm = windowManager;
        card = null;
        windowManager = null;
        if (view == null || wm == null) return;
        try {
            view.animate().alpha(0f).translationY(-dp(90)).setDuration(160)
                    .withEndAction(new Runnable() {
                        @Override
                        public void run() {
                            try {
                                wm.removeView(view);
                            } catch (Throwable ignored) {
                            }
                        }
                    }).start();
        } catch (Throwable t) {
            try {
                wm.removeView(view);
            } catch (Throwable ignored) {
            }
        }
    }

    private int dp(float value) {
        return Math.round(value * context.getResources().getDisplayMetrics().density);
    }
}
