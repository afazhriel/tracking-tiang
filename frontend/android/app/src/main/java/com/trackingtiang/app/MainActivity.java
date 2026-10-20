package com.trackingtiang.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebView;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Handle deep link on cold start
        handleDeepLink(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleDeepLink(intent);
    }

    /**
     * Tombol back perangkat.
     *
     * Tanpa override ini, menekan back langsung menutup aplikasi
     * walaupun pengguna sedang beberapa langkah di dalam halaman.
     * Perilaku yang diharapkan: kembali dulu di riwayat WebView,
     * baru keluar kalau sudah di halaman pertama.
     *
     * CATATAN API: kelas `Bridge` Capacitor 8 TIDAK punya
     * `canGoBack()`/`goBack()` (itu ada di versi lama). Yang tersedia
     * `getWebView()`, jadi riwayat dibaca langsung dari WebView.
     */
    @Override
    public void onBackPressed() {
        Bridge bridge = getBridge();
        WebView webView = bridge != null ? bridge.getWebView() : null;

        if (webView != null && webView.canGoBack()) {
            webView.goBack();
            return;
        }

        super.onBackPressed();
    }

    /**
     * Deep link.
     *
     * Dulu method ini hanya memeriksa skema/host lalu tidak melakukan
     * apa pun. Akibatnya tautan seperti
     * `https://pjl.ituiot.com/tiang/123` membuka APK tetapi tetap
     * menampilkan halaman awal. Sekarang path dari intent
     * diteruskan ke WebView.
     */
    private void handleDeepLink(Intent intent) {
        if (intent == null || intent.getData() == null) return;

        Uri data = intent.getData();
        String scheme = data.getScheme();
        String host = data.getHost();

        if (!"https".equals(scheme) && !"trackingtiang".equals(scheme)) return;
        if ("https".equals(scheme) && !"pjl.ituiot.com".equals(host)) return;
        if ("trackingtiang".equals(scheme) && !"app".equals(host)) return;

        String path = data.getPath();

        if (path == null || path.isEmpty()) return;

        // Query ikut diteruskan (mis. filter atau token undangan).
        String query = data.getQuery();
        if (query != null && !query.isEmpty()) {
            path = path + "?" + query;
        }

        if (getBridge() == null) return;

        WebView webView = getBridge().getWebView();
        if (webView == null) return;

        // Path dibaca sebagai URL relatif terhadap origin WebView,
        // jadi skema kustom `trackingtiang://app/...` pun bekerja.
        final String target = path;

        webView.post(new Runnable() {
            @Override
            public void run() {
                webView.loadUrl(target);
            }
        });
    }
}
