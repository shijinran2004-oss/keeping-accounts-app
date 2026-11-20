package com.shijinran.money.capture;

import android.app.AppOpsManager;
import android.content.Context;
import android.content.Intent;
import android.content.res.ColorStateList;
import android.graphics.Bitmap;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.Log;
import android.view.Gravity;
import android.view.View;
import android.view.ViewTreeObserver;
import android.view.WindowManager;
import android.view.animation.DecelerateInterpolator;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import com.shijinran.money.MainActivity;
import com.shijinran.money.R;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import cdflynn.android.library.checkview.CheckView;

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
    private static final int CANCEL_BG = 0xFFF4EFE6;
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
    /** 上面那行「缩略图 + 识别到 ¥X」；记成功后整行藏起来换成对勾 */
    private LinearLayout rowView;
    /** 「取消 / 确认记录」两个按钮 */
    private LinearLayout buttonsView;
    /** 记好以后显示的对勾区块 */
    private LinearLayout successRow;
    private TextView successSubtitle;
    private CheckView checkView;
    private long amountCents;
    private String ocrText = "";
    /** 识别时认出来的商户名 / 交易单号 / 当前选中的分类 */
    private String merchant;
    private String orderId;
    private String categoryId;
    /** 卡片根布局，分类 chips 要插在按钮上面 */
    private LinearLayout rootView;
    /** 「餐饮 / 交通…」分类备选那一行；每点一次重建一遍，所以留着引用好移除 */
    private HorizontalScrollView chipsView;

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

    /**
     * 认出金额之后才把卡片滑下来。
     * 以前是「一截到图先弹『正在认金额…』、认不出再收走」，桌面、聊天这类
     * 没有金额的截图也会在屏幕顶上闪一下卡片，看着像状态栏闪屏；现在认准了
     * 才出现，认不出的截图一点动静都没有。
     * 同步等 UI 线程挂上去，调用方接着用 isShowing() 判断 ROM 有没有拦窗口。
     */
    public static void showFound(Context context, long key, int notifyId, String path, Bitmap thumb,
                                 final String amount, final long amountCents, final String text,
                                 final String merchant, final String orderId, final String categoryId,
                                 final List<CategoryHints.Guess> guesses) {
        if (!permitted(context)) return;
        final Bitmap preview = thumb;
        final java.util.concurrent.CountDownLatch done = new java.util.concurrent.CountDownLatch(1);
        UI.post(new Runnable() {
            @Override
            public void run() {
                try {
                    // 先把上一张收掉再挂新的。这里不能调 dismiss()：它自己还会再 post 一次，
                    // 等它跑到时 current 已经是新卡片，会把刚挂上的这张立刻收掉（看不见卡片）。
                    CaptureOverlay old = current;
                    current = null;
                    if (old != null) old.dismissSelf();
                    CaptureOverlay overlay = new CaptureOverlay(context, key, notifyId, path);
                    overlay.attach(preview);
                    overlay.amountCents = amountCents;
                    overlay.ocrText = text == null ? "" : text;
                    overlay.merchant = merchant;
                    overlay.orderId = orderId;
                    overlay.categoryId = categoryId;
                    overlay.titleView.setText("识别到 ¥" + amount);
                    // 认出商户时把店名写在副标题里：用户一眼就知道是哪笔，不用点开 App
                    if (merchant != null && !merchant.isEmpty()) {
                        overlay.subtitleView.setText(merchant + " · 点「确认记录」直接记一笔");
                    } else {
                        overlay.subtitleView.setText("点「确认记录」直接记一笔，不用打开 App");
                    }
                    overlay.renderChips(guesses);
                    overlay.confirmView.setAlpha(1f);
                    overlay.confirmView.setEnabled(true);
                    overlay.restartTimer();
                    current = overlay;
                    // addView 之后要等一次遍历，isShown() 才会变 true；调用方紧接着
                    // 用 isShowing() 判断 ROM 有没有拦窗口，所以这里多等这一小会儿，
                    // 否则卡片明明画出来了也会被当成「被拦掉」而退回通知。
                    final View card = overlay.card;
                    if (card == null) {
                        done.countDown();
                    } else {
                        // 等这一帧真的画出来再放行，而不是死等 150ms：
                        // 用 OnPreDraw 监听第一次绘制，画完立即 countDown（固定等 150ms 白白多花一百多毫秒）
                        final ViewTreeObserver observer = card.getViewTreeObserver();
                        final boolean[] counted = new boolean[1];
                        if (!observer.isAlive()) {
                            done.countDown();
                        } else {
                            observer.addOnPreDrawListener(new ViewTreeObserver.OnPreDrawListener() {
                                @Override
                                public boolean onPreDraw() {
                                    if (counted[0]) return true;
                                    counted[0] = true;
                                    ViewTreeObserver live = card.getViewTreeObserver();
                                    if (live.isAlive()) live.removeOnPreDrawListener(this);
                                    // 绘制帧结束之后再判断 isShown()，此时 windowToken 已经挂上
                                    card.post(new Runnable() {
                                        @Override
                                        public void run() {
                                            done.countDown();
                                        }
                                    });
                                    return true;
                                }
                            });
                            // 兜底：万一这一帧没来（被 ROM 拦了、窗口没挂上），也别把识别线程卡死
                            card.postDelayed(new Runnable() {
                                @Override
                                public void run() {
                                    if (!counted[0]) {
                                        counted[0] = true;
                                        done.countDown();
                                    }
                                }
                            }, 300);
                        }
                    }
                } catch (Throwable t) {
                    Log.w("SnoopyCapture", "overlay attach failed", t);
                    done.countDown();
                }
            }
        });
        try {
            done.await(800, java.util.concurrent.TimeUnit.MILLISECONDS);
        } catch (InterruptedException ignored) {
        }
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

        // 外壳只负责留白：卡片四周的投影要地方画，不然会被窗口边界裁掉。
        FrameLayout holder = new FrameLayout(context);
        holder.setClipChildren(false);
        holder.setClipToPadding(false);
        holder.setPadding(dp(14), dp(8), dp(14), dp(16));

        LinearLayout root = new LinearLayout(context);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(18), dp(16), dp(18), dp(16));
        root.setBackground(cardBackground());
        root.setElevation(dp(14));
        holder.addView(root, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT));
        rootView = root;

        LinearLayout row = new LinearLayout(context);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);

        // 缩略图外面套一圈很淡的描边，截图本身是白底时也能看出边界
        FrameLayout thumb = new FrameLayout(context);
        int side = dp(48);
        LinearLayout.LayoutParams thumbLp = new LinearLayout.LayoutParams(side, side);
        thumbLp.setMarginEnd(dp(14));
        thumb.setLayoutParams(thumbLp);
        thumb.setPadding(dp(1), dp(1), dp(1), dp(1));
        GradientDrawable ring = new GradientDrawable();
        ring.setColor(THUMB_BG);
        ring.setCornerRadius(dp(16));
        ring.setStroke(dp(1), 0x14000000);
        thumb.setBackground(ring);
        thumb.setClipToOutline(true);

        ImageView icon = new ImageView(context);
        icon.setLayoutParams(new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        icon.setScaleType(ImageView.ScaleType.CENTER_CROP);
        GradientDrawable round = new GradientDrawable();
        round.setColor(THUMB_BG);
        round.setCornerRadius(dp(15));
        icon.setBackground(round);
        icon.setClipToOutline(true);
        if (thumbBmp != null) icon.setImageBitmap(thumbBmp);
        thumb.addView(icon);
        row.addView(thumb);

        LinearLayout texts = new LinearLayout(context);
        texts.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams textsLp = new LinearLayout.LayoutParams(0,
                LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        texts.setLayoutParams(textsLp);

        titleView = new TextView(context);
        titleView.setText("正在认金额…");
        titleView.setTextColor(INK);
        titleView.setTextSize(17f);
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
        subLp.topMargin = dp(4);
        subtitleView.setLayoutParams(subLp);
        texts.addView(subtitleView);
        row.addView(texts);
        root.addView(row);
        rowView = row;

        LinearLayout buttons = new LinearLayout(context);
        buttons.setOrientation(LinearLayout.HORIZONTAL);
        buttons.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout.LayoutParams buttonsLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        buttonsLp.topMargin = dp(14);
        buttons.setLayoutParams(buttonsLp);

        TextView cancel = new TextView(context);
        cancel.setText("取消");
        cancel.setTextColor(CANCEL_INK);
        cancel.setTextSize(14f);
        cancel.setGravity(Gravity.CENTER);
        cancel.setBackground(pill(CANCEL_BG, 22, 0x1A000000));
        LinearLayout.LayoutParams cancelLp = new LinearLayout.LayoutParams(0, dp(44), 1f);
        cancel.setLayoutParams(cancelLp);
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
        confirmView.setTextSize(14f);
        confirmView.setTypeface(null, android.graphics.Typeface.BOLD);
        confirmView.setGravity(Gravity.CENTER);
        confirmView.setBackground(pill(ACCENT, 22, 0x40FFFFFF));
        confirmView.setEnabled(false);
        confirmView.setAlpha(0.45f);
        LinearLayout.LayoutParams confirmLp = new LinearLayout.LayoutParams(0, dp(44), 1f);
        confirmLp.setMarginStart(dp(10));
        confirmView.setLayoutParams(confirmLp);
        confirmView.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (amountCents <= 0) return;
                // 先给一下触感，再把卡片换成对勾；记账本身很快，不用等它回来
                try {
                    v.performHapticFeedback(Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
                            ? android.view.HapticFeedbackConstants.CONFIRM
                            : android.view.HapticFeedbackConstants.VIRTUAL_KEY);
                } catch (Throwable ignored) {
                }
                try {
                    // 分类选过就按选的记；商户和单号也一起带走，前端不用再猜
                    CaptureCancelReceiver.recordShot(context, key, notifyId, amountCents, ocrText,
                            merchant, categoryId, orderId);
                } catch (Throwable ignored) {
                }
                showRecorded();
            }
        });
        buttons.addView(confirmView);
        root.addView(buttons);
        buttonsView = buttons;

        // 记成功的那一下：整张卡片换成一个对勾。
        // 动画用 cdflynn/checkview（开源小库，JitPack: com.github.cdflynn:checkview:v1.2），
        // 它用 PathMeasure 先把圆圈画出来、再顺着笔画勾，末了轻轻弹一下，
        // 比我们自己拿 ValueAnimator 拼路径省事，也更像系统级的确认反馈。
        successRow = new LinearLayout(context);
        successRow.setOrientation(LinearLayout.HORIZONTAL);
        successRow.setGravity(Gravity.CENTER_VERTICAL);
        successRow.setVisibility(View.GONE);

        checkView = new CheckView(context);
        LinearLayout.LayoutParams checkLp = new LinearLayout.LayoutParams(dp(48), dp(48));
        checkLp.setMarginEnd(dp(14));
        successRow.addView(checkView, checkLp);

        LinearLayout doneTexts = new LinearLayout(context);
        doneTexts.setOrientation(LinearLayout.VERTICAL);

        TextView doneTitle = new TextView(context);
        doneTitle.setText("已记一笔");
        doneTitle.setTextColor(INK);
        doneTitle.setTextSize(17f);
        doneTitle.setTypeface(null, android.graphics.Typeface.BOLD);
        doneTexts.addView(doneTitle);

        successSubtitle = new TextView(context);
        successSubtitle.setTextColor(MUTE);
        successSubtitle.setTextSize(12f);
        successSubtitle.setMaxLines(1);
        successSubtitle.setEllipsize(android.text.TextUtils.TruncateAt.END);
        LinearLayout.LayoutParams doneSubLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        doneSubLp.topMargin = dp(4);
        successSubtitle.setLayoutParams(doneSubLp);
        doneTexts.addView(successSubtitle);

        successRow.addView(doneTexts);
        root.addView(successRow);

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

        card = holder;
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
        lp.y = dp(20);
        windowManager.addView(card, lp);

        card.setAlpha(0f);
        card.setTranslationY(-dp(40));
        card.setScaleX(0.94f);
        card.setScaleY(0.94f);
        card.animate().alpha(1f).translationY(0f).scaleX(1f).scaleY(1f)
                .setInterpolator(new DecelerateInterpolator(1.6f))
                .setDuration(260).start();
        restartTimer();
    }

    /**
     * 分类备选：一行小圆角按钮，点一下换选中，再点「确认记录」就按这个分类记。
     * 不点也能记——默认用识别时猜出来的那个分类，卡片不会因为要选分类挡住记账。
     */
    private void renderChips(final List<CategoryHints.Guess> guesses) {
        if (rootView == null || buttonsView == null) return;
        if (chipsView != null) {
            int old = rootView.indexOfChild(chipsView);
            if (old >= 0) rootView.removeViewAt(old);
            chipsView = null;
        }
        if (guesses == null || guesses.isEmpty()) return;
        HorizontalScrollView scroll = new HorizontalScrollView(context);
        scroll.setHorizontalScrollBarEnabled(false);
        scroll.setClipToPadding(false);
        LinearLayout chips = new LinearLayout(context);
        chips.setOrientation(LinearLayout.HORIZONTAL);
        for (final CategoryHints.Guess guess : guesses) {
            final boolean selected = guess.id.equals(categoryId);
            final TextView chip = new TextView(context);
            chip.setText(guess.name);
            chip.setTextSize(12f);
            chip.setGravity(Gravity.CENTER);
            chip.setSingleLine(true);
            chip.setPadding(dp(12), dp(6), dp(12), dp(6));
            if (selected) {
                chip.setTextColor(0xFFFFFFFF);
                chip.setBackground(pill(ACCENT, 16, 0x40FFFFFF));
            } else {
                chip.setTextColor(CANCEL_INK);
                chip.setBackground(pill(CANCEL_BG, 16, 0x1A000000));
            }
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
            lp.setMarginEnd(dp(8));
            chip.setLayoutParams(lp);
            chip.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    categoryId = guess.id;
                    renderChips(guesses);
                }
            });
            chips.addView(chip);
        }
        scroll.addView(chips);
        LinearLayout.LayoutParams scrollLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        scrollLp.topMargin = dp(12);
        scroll.setLayoutParams(scrollLp);
        chipsView = scroll;
        int at = rootView.indexOfChild(buttonsView);
        rootView.addView(scroll, at < 0 ? rootView.getChildCount() : at);
    }

    /**
     * 点「确认记录」之后：两行按钮收起来，换成对勾动画，停一会儿再自己滑走。
     * 之前是点完直接消失，用户根本不知道记没记上——尤其这张卡只停留 15 秒。
     */
    private void showRecorded() {
        UI.removeCallbacks(hideTask);
        if (successRow == null) {
            dismissSelf();
            return;
        }
        if (rowView != null) rowView.setVisibility(View.GONE);
        if (buttonsView != null) buttonsView.setVisibility(View.GONE);
        String shop = merchant == null || merchant.isEmpty() ? "" : merchant + " · ";
        successSubtitle.setText(shop + money(amountCents) + " 已写进账本，回 App 就能看到");
        successRow.setVisibility(View.VISIBLE);
        if (checkView != null) checkView.check();
        // 勾 300ms 画完、280ms 后开始 250ms 的缩放，再留一点时间让人看清
        UI.postDelayed(hideTask, 1_600L);
    }

    /** 分转成「¥12.34」：卡片上只显示金额，不带别的字，和标题里的写法保持一致 */
    private String money(long cents) {
        return String.format(Locale.CHINA, "¥%.2f", cents / 100.0);
    }

    private GradientDrawable cardBackground() {
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(CARD_BG);
        bg.setCornerRadius(dp(28));
        return bg;
    }

    /** 全圆角按钮：按下时有一圈很淡的水波纹，手感更像系统控件 */
    private RippleDrawable pill(int fill, int radiusDp, int rippleColor) {
        GradientDrawable content = new GradientDrawable();
        content.setColor(fill);
        content.setCornerRadius(dp(radiusDp));
        GradientDrawable mask = new GradientDrawable();
        mask.setColor(0xFFFFFFFF);
        mask.setCornerRadius(dp(radiusDp));
        return new RippleDrawable(ColorStateList.valueOf(rippleColor), content, mask);
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
            view.animate().alpha(0f).translationY(-dp(36)).scaleX(0.96f).scaleY(0.96f)
                    .setDuration(150)
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
