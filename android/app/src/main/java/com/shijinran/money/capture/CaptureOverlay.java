package com.shijinran.money.capture;

import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.PixelFormat;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import com.shijinran.money.MainActivity;

/**
 * 截屏后立刻弹出的确认卡片（悬浮窗），做法和微信/QQ 的截图浮层一样。
 * 只有用户点了「去记账」才会进记账页；点「忽略」什么都不留下。
 */
public final class CaptureOverlay {

    private static final long AUTO_HIDE_MS = 20_000L;
    private static final int WIDTH_DP = 300;

    private static final int COLOR_CARD = 0xFFFFFDF8;
    private static final int COLOR_BORDER = 0xFFE7DFD1;
    private static final int COLOR_INK = 0xFF211F1A;
    private static final int COLOR_MUTE = 0xFF8A7F6A;
    private static final int COLOR_ACCENT = 0xFFC2563B;
    private static final int COLOR_THUMB = 0xFFF3EDE1;

    private static final Handler UI = new Handler(Looper.getMainLooper());
    private static CaptureOverlay current;

    private final Context context;
    private final WindowManager windowManager;
    private final float density;
    private final String path;

    private final LinearLayout card;
    private final ImageView thumbView;
    private final TextView amountView;
    private final TextView hintView;

    private final Runnable hideTask = new Runnable() {
        @Override
        public void run() {
            dismiss();
        }
    };

    private CaptureOverlay(Context context, String path) {
        this.context = context;
        this.path = path;
        this.density = context.getResources().getDisplayMetrics().density;
        this.windowManager = (WindowManager) context.getSystemService(Context.WINDOW_SERVICE);

        card = new LinearLayout(context);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(13), dp(12), dp(13), dp(10));
        GradientDrawable background = new GradientDrawable();
        background.setColor(COLOR_CARD);
        background.setCornerRadius(dp(18));
        background.setStroke(Math.max(1, dp(1)), COLOR_BORDER);
        card.setBackground(background);
        card.setElevation(dp(12));

        LinearLayout row = new LinearLayout(context);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);

        thumbView = new ImageView(context);
        LinearLayout.LayoutParams thumbParams = new LinearLayout.LayoutParams(dp(46), dp(46));
        thumbParams.rightMargin = dp(11);
        thumbView.setLayoutParams(thumbParams);
        thumbView.setScaleType(ImageView.ScaleType.CENTER_CROP);
        GradientDrawable thumbBackground = new GradientDrawable();
        thumbBackground.setColor(COLOR_THUMB);
        thumbBackground.setCornerRadius(dp(12));
        thumbView.setBackground(thumbBackground);
        thumbView.setClipToOutline(true);
        row.addView(thumbView);

        LinearLayout texts = new LinearLayout(context);
        texts.setOrientation(LinearLayout.VERTICAL);

        TextView title = new TextView(context);
        title.setText("截图记账");
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
        title.setTextColor(COLOR_MUTE);

        amountView = new TextView(context);
        amountView.setText("正在认金额…");
        amountView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 17);
        amountView.setTextColor(COLOR_INK);
        amountView.setTypeface(Typeface.DEFAULT_BOLD);

        hintView = new TextView(context);
        hintView.setText("截屏收到，先别切走");
        hintView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
        hintView.setTextColor(COLOR_MUTE);

        texts.addView(title);
        texts.addView(amountView);
        texts.addView(hintView);
        row.addView(texts);
        card.addView(row);

        LinearLayout actions = new LinearLayout(context);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        actions.setGravity(Gravity.END);
        LinearLayout.LayoutParams actionsParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        actionsParams.topMargin = dp(9);
        actions.setLayoutParams(actionsParams);

        TextView ignore = button("忽略", 0x00000000, COLOR_MUTE, false);
        ignore.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                CaptureStore.clearPendingPath(context);
                dismiss();
            }
        });
        LinearLayout.LayoutParams ignoreParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        ignoreParams.rightMargin = dp(4);
        actions.addView(ignore, ignoreParams);

        TextView open = button("去记账", COLOR_ACCENT, 0xFFFFFFFF, true);
        open.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                openApp();
                dismiss();
            }
        });
        actions.addView(open);
        card.addView(actions);
    }

    /** 有悬浮窗权限时截屏后直接弹卡片，比通知快一步。 */
    public static boolean permitted(Context context) {
        if (context == null) return false;
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true;
        try {
            return Settings.canDrawOverlays(context);
        } catch (Throwable t) {
            return false;
        }
    }

    /** 去系统设置里打开「显示在其他应用上层」。 */
    public static Intent permissionIntent(Context context) {
        Intent intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:" + context.getPackageName()));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return intent;
    }

    public static void show(Context context, String path, Bitmap thumb) {
        if (context == null || path == null || !permitted(context)) return;
        final Context app = context.getApplicationContext();
        UI.post(new Runnable() {
            @Override
            public void run() {
                dismiss();
                try {
                    CaptureOverlay overlay = new CaptureOverlay(app, path);
                    overlay.attach(thumb);
                    current = overlay;
                } catch (Throwable ignored) {
                    current = null;
                }
            }
        });
    }

    /** 识别完成后把卡片更新成金额和提示。 */
    public static void update(String amountText, String hintText) {
        UI.post(new Runnable() {
            @Override
            public void run() {
                if (current == null) return;
                current.amountView.setText(amountText);
                current.hintView.setText(hintText);
                current.restartTimer();
            }
        });
    }

    public static void dismiss() {
        if (Looper.myLooper() != Looper.getMainLooper()) {
            UI.post(new Runnable() {
                @Override
                public void run() {
                    dismiss();
                }
            });
            return;
        }
        CaptureOverlay gone = current;
        current = null;
        if (gone != null) gone.remove();
    }

    private void attach(Bitmap thumb) {
        if (thumb != null) thumbView.setImageBitmap(thumb);
        WindowManager.LayoutParams params = new WindowManager.LayoutParams(
                dp(WIDTH_DP), WindowManager.LayoutParams.WRAP_CONTENT,
                overlayType(),
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                        | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
                PixelFormat.TRANSLUCENT);
        params.gravity = Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL;
        params.y = dp(86);
        windowManager.addView(card, params);
        card.setAlpha(0f);
        card.setTranslationY(dp(18));
        card.animate().alpha(1f).translationY(0f).setDuration(170).start();
        restartTimer();
    }

    private void remove() {
        UI.removeCallbacks(hideTask);
        try {
            windowManager.removeView(card);
        } catch (Throwable ignored) {
        }
    }

    private void restartTimer() {
        UI.removeCallbacks(hideTask);
        UI.postDelayed(hideTask, AUTO_HIDE_MS);
    }

    private void openApp() {
        CaptureStore.setPendingPath(context, path);
        CaptureStore.setPendingSource(context, "screenshot");
        try {
            Intent intent = new Intent(context, MainActivity.class);
            intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            intent.putExtra(CapturePlugin.EXTRA_PENDING, path);
            context.startActivity(intent);
        } catch (Throwable ignored) {
        }
    }

    private TextView button(String text, int backgroundColor, int textColor, boolean bold) {
        TextView view = new TextView(context);
        view.setText(text);
        view.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        view.setTextColor(textColor);
        view.setGravity(Gravity.CENTER);
        view.setPadding(dp(14), dp(7), dp(14), dp(7));
        if (bold) view.setTypeface(Typeface.DEFAULT_BOLD);
        GradientDrawable background = new GradientDrawable();
        background.setColor(backgroundColor);
        background.setCornerRadius(dp(999));
        view.setBackground(background);
        return view;
    }

    private int overlayType() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            return WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY;
        }
        return WindowManager.LayoutParams.TYPE_PHONE;
    }

    private int dp(int value) {
        return Math.round(value * density);
    }
}
