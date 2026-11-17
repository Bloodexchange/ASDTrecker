package com.asdtrecker.app;

import android.app.Activity;
import android.app.KeyguardManager;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.provider.Settings;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import org.json.JSONObject;
import java.io.*;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.net.HttpCookie;
import java.util.List;
import java.util.Map;
import java.util.Arrays;
import java.util.Collections;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.net.ssl.HttpsURLConnection;

/** Offline-first local UI. The only network API is a fixed, public exchange-rate endpoint. */
public final class MainActivity extends Activity {
    private static final String ORIGIN = "https://appassets.androidplatform.net";
    private static final int AUTH = 101, EXPORT = 102, IMPORT = 103;
    private static final int MAX_BYTES = 15_000_000;
    private WebView web;
    private LinearLayout cover;
    private KeyguardManager keyguard;
    private volatile boolean unlocked = false;
    private boolean authenticating = false, loaded = false;
    private String exportText = null, pendingImport = null;
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private AtomicFile vault;
    private AtomicFile ownerFile, sessionFile;
    private String cloudOwner = "";

    @Override public void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        getWindow().setStatusBarColor(Color.rgb(9,10,16));
        getWindow().setNavigationBarColor(Color.rgb(16,14,24));
        if (android.os.Build.VERSION.SDK_INT >= 31) getWindow().setHideOverlayWindows(true);
        keyguard = (KeyguardManager) getSystemService(KEYGUARD_SERVICE);
        vault = new AtomicFile(new File(getFilesDir(), "finance.vault"));
        ownerFile = new AtomicFile(new File(getFilesDir(), "cloud-owner.vault"));
        sessionFile = new AtomicFile(new File(getFilesDir(), "cloud-session.vault"));
        try { cloudOwner = readSecure(ownerFile); if (!cloudOwner.isEmpty()) vault = accountVault(new JSONObject(cloudOwner).getString("id")); } catch(Exception ignored) { cloudOwner = ""; }
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(9,10,16));
        root.setOnApplyWindowInsetsListener((v,insets)->{
            v.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());
            return insets.consumeSystemWindowInsets();
        });
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(9,10,16));
        WebView.setWebContentsDebuggingEnabled(false);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setSafeBrowsingEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        android.webkit.CookieManager.getInstance().setAcceptCookie(false);
        web.addJavascriptInterface(new Bridge(), "Android");
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                // Attribution opens externally; never expose the bridge to remote content.
                if (request.isForMainFrame() && request.hasGesture() && "https".equals(uri.getScheme()) && ("www.exchangerate-api.com".equals(uri.getHost())||"currencyapi.com".equals(uri.getHost())||"cbu.uz".equals(uri.getHost()))) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("cbu.uz".equals(uri.getHost())?"https://cbu.uz/ru/arkhiv-kursov-valyut/":"currencyapi.com".equals(uri.getHost())?"https://currencyapi.com":"https://www.exchangerate-api.com"))); } catch (Exception ignored) { }
                }
                return true;
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("https".equals(uri.getScheme()) && "appassets.androidplatform.net".equals(uri.getHost()) && "GET".equals(request.getMethod())) {
                    String path = uri.getPath();
                    if (path == null || path.equals("/")) path = "/index.html";
                    if (path.matches("/[a-zA-Z0-9_-]+\\.(html|js|css|svg)")) {
                        try {
                            String mime = path.endsWith(".html")?"text/html":path.endsWith(".js")?"text/javascript":path.endsWith(".css")?"text/css":"image/svg+xml";
                            return new WebResourceResponse(mime, "UTF-8", 200, "OK", Collections.singletonMap("Cache-Control","no-store"), getAssets().open(path.substring(1)));
                        } catch (IOException ignored) { }
                    }
                }
                return new WebResourceResponse("text/plain", "UTF-8", 403, "Forbidden", Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
            }
        });
        root.addView(web,new FrameLayout.LayoutParams(-1,-1));
        cover = new LinearLayout(this);
        cover.setOrientation(LinearLayout.VERTICAL);
        cover.setGravity(Gravity.CENTER);
        cover.setPadding(48,48,48,48);
        cover.setBackgroundColor(Color.rgb(9,10,16));
        TextView title = new TextView(this);
        title.setText("ASDTrecker"); title.setTextSize(30); title.setTextColor(Color.rgb(231,220,244));
        title.setGravity(Gravity.CENTER); cover.addView(title);
        TextView subtitle = new TextView(this);
        subtitle.setText("Ваше личное финансовое пространство\nПодтвердите вход на устройстве");subtitle.setTextSize(14);subtitle.setTextColor(Color.rgb(166,149,185));subtitle.setGravity(Gravity.CENTER);subtitle.setPadding(0,24,0,40);cover.addView(subtitle);
        Button button = new Button(this);button.setText("Разблокировать");button.setOnClickListener(v->authenticate());cover.addView(button);
        root.addView(cover,new FrameLayout.LayoutParams(-1,-1));
        setContentView(root);
    }
    @Override protected void onResume() {
        super.onResume(); web.onResume();
        if (!unlocked && !authenticating) {
            if (!keyguard.isDeviceSecure()) unlock();
            else authenticate();
        }
    }
    @Override protected void onPause() {
        super.onPause();
        unlocked = false;
        cover.setVisibility(View.VISIBLE);
        web.onPause();
    }
    private void authenticate() {
        if (authenticating) return;
        if (!keyguard.isDeviceSecure()) { unlock(); return; }
        Intent intent = keyguard.createConfirmDeviceCredentialIntent("ASDTrecker", "Подтвердите вход в личные финансы");
        if (intent != null) { authenticating = true; startActivityForResult(intent, AUTH); }
    }
    private void unlock() {
        unlocked = true; cover.setVisibility(View.GONE);
        if (!loaded) { loaded = true; web.loadUrl(ORIGIN + "/index.html"); }
        if (pendingImport != null) { String data = pendingImport; pendingImport = null; web.postDelayed(()->callback("onBackupPicked",data),300); }
    }
    private void callback(String fn,String value) {runOnUiThread(()->{if(unlocked)web.evaluateJavascript("window."+fn+" && window."+fn+"("+JSONObject.quote(value)+")",null);});}
    private synchronized SecretKey key() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore"); ks.load(null);
        String alias="ASDTrecker.vault.v1";
        if (!ks.containsAlias(alias)) {
            if(vault.getBaseFile().exists()||new File(vault.getBaseFile().getPath()+".bak").exists())throw new IOException("Missing key for existing vault");
            KeyGenerator generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(alias,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setKeySize(256).setRandomizedEncryptionRequired(true).build());
            generator.generateKey();
        }
        return (SecretKey)ks.getKey(alias,null);
    }
    private static byte[] readBounded(InputStream input) throws IOException {
        try(InputStream in=input;ByteArrayOutputStream out=new ByteArrayOutputStream()) {byte[] buf=new byte[8192];int n;while((n=in.read(buf))!=-1){if(out.size()+n>MAX_BYTES)throw new IOException("Too large");out.write(buf,0,n);}return out.toByteArray();}
    }
    private AtomicFile accountVault(String id) throws Exception {
        if(!id.matches("[A-Za-z0-9_-]{1,80}"))throw new IOException();
        byte[] bytes=MessageDigest.getInstance("SHA-256").digest(id.getBytes(StandardCharsets.UTF_8));StringBuilder hex=new StringBuilder();for(byte b:bytes)hex.append(String.format("%02x",b));
        return new AtomicFile(new File(getFilesDir(),"account-"+hex+".vault"));
    }
    private synchronized String readSecure(AtomicFile file) throws Exception {
        if(!file.getBaseFile().exists()&&!new File(file.getBaseFile().getPath()+".bak").exists())return "";
        byte[] data=readBounded(file.openRead());if(data.length<28)throw new IOException();Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,Arrays.copyOfRange(data,0,12)));return new String(cipher.doFinal(Arrays.copyOfRange(data,12,data.length)),StandardCharsets.UTF_8);
    }
    private synchronized boolean writeSecure(AtomicFile file,String text){FileOutputStream out=null;try{Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,key());byte[] encrypted=cipher.doFinal(text.getBytes(StandardCharsets.UTF_8));out=file.startWrite();out.write(cipher.getIV());out.write(encrypted);file.finishWrite(out);return true;}catch(Exception e){if(out!=null)file.failWrite(out);return false;}}
    public final class Bridge {
        @JavascriptInterface public String loadVault() {
            if(!unlocked)return "{\"error\":\"locked\"}";
            synchronized(MainActivity.this){
                if(!vault.getBaseFile().exists()&&!new File(vault.getBaseFile().getPath()+".bak").exists())return "";
                try{byte[] data=readBounded(vault.openRead());if(data.length<29)throw new IOException();Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,Arrays.copyOfRange(data,0,12)));return new String(cipher.doFinal(Arrays.copyOfRange(data,12,data.length)),StandardCharsets.UTF_8);}
                catch(Exception e){return "{\"error\":\"vault-unavailable\"}";}
            }
        }
        @JavascriptInterface public boolean saveVault(String text) {
            if(!unlocked||text==null||text.length()>10_000_000)return false;
            synchronized(MainActivity.this){try{JSONObject s=new JSONObject(text);if("ASDTrecker.device.v2".equals(s.optString("format")))s=s.getJSONObject("state");if(s.getInt("version")!=1||!s.has("transactions")||!s.has("accounts"))return false;return writeSecure(vault,text);}catch(Exception e){return false;}}
        }
        @JavascriptInterface public String getCloudOwner(){return unlocked?cloudOwner:"";}
        @JavascriptInterface public boolean setCloudOwner(String value){if(!unlocked)return false;synchronized(MainActivity.this){try{AtomicFile next=value.isEmpty()?new AtomicFile(new File(getFilesDir(),"finance.vault")):accountVault(new JSONObject(value).getString("id"));if(!writeSecure(ownerFile,value))return false;cloudOwner=value;vault=next;return true;}catch(Exception e){return false;}}}
        @JavascriptInterface public void clearAccountCache(){if(unlocked&&!cloudOwner.isEmpty())synchronized(MainActivity.this){vault.delete();}}
        @JavascriptInterface public void cloudRequest(String id,String path,String method,String body){
            if(!unlocked||id==null||!id.matches("[A-Za-z0-9_-]{1,80}"))return;
            boolean allowed=("GET".equals(method)&&(path.equals("/api/auth/get-session")||path.equals("/api/vault")||path.equals("/api/rates")))||("PUT".equals(method)&&path.equals("/api/vault"))||("POST".equals(method)&&(path.equals("/api/auth/sign-in/email")||path.equals("/api/auth/sign-up/email")||path.equals("/api/auth/sign-out")||path.equals("/api/auth/change-password")));
            if(!allowed||body==null||body.length()>4_000_000)return;
            io.execute(()->{HttpsURLConnection c=null;JSONObject result=new JSONObject();try{
                c=(HttpsURLConnection)new URL(getString(R.string.cloud_origin)+path).openConnection();c.setConnectTimeout(10000);c.setReadTimeout(20000);c.setInstanceFollowRedirects(false);c.setRequestMethod(method);c.setRequestProperty("Origin",ORIGIN);c.setRequestProperty("Accept","application/json");
                String cookie=readSecure(sessionFile);if(!cookie.isEmpty())c.setRequestProperty("Cookie",cookie);
                if(!body.isEmpty()){c.setDoOutput(true);c.setRequestProperty("Content-Type","application/json");try(OutputStream out=c.getOutputStream()){out.write(body.getBytes(StandardCharsets.UTF_8));}}
                int status=c.getResponseCode();
                for(Map.Entry<String,List<String>> header:c.getHeaderFields().entrySet())if(header.getKey()!=null&&header.getKey().equalsIgnoreCase("Set-Cookie"))for(String raw:header.getValue())for(HttpCookie parsed:HttpCookie.parse(raw))if(parsed.getName().equals("__Secure-asdtrecker.session_token")||parsed.getName().equals("asdtrecker.session_token")){String value=parsed.getMaxAge()==0?"":raw.split(";",2)[0];if(!writeSecure(sessionFile,value))throw new IOException("Session persistence failed");}
                InputStream stream=status>=400?c.getErrorStream():c.getInputStream();String text=stream==null?"{}":new String(readBounded(stream),StandardCharsets.UTF_8);Object payload=text.trim().equals("null")?JSONObject.NULL:new JSONObject(text);if(payload instanceof JSONObject){JSONObject p=(JSONObject)payload;p.remove("token");if(p.optJSONObject("session")!=null)p.getJSONObject("session").remove("token");}
                result.put("status",status);result.put("body",payload);
            }catch(Exception e){try{result.put("status",503);result.put("body",new JSONObject().put("error","SERVICE_UNAVAILABLE"));}catch(Exception ignored){}}finally{if(c!=null)c.disconnect();}
            final String response=result.toString();runOnUiThread(()->{if(unlocked)web.evaluateJavascript("window.onCloudResponse && window.onCloudResponse("+JSONObject.quote(id)+","+JSONObject.quote(response)+")",null);});
            });
        }
        @JavascriptInterface public boolean isDeviceSecure(){return keyguard.isDeviceSecure();}
        @JavascriptInterface public void lock(){runOnUiThread(()->{unlocked=false;cover.setVisibility(View.VISIBLE);if(keyguard.isDeviceSecure())authenticate();else{Toast.makeText(MainActivity.this,"Настройте PIN или пароль экрана и вернитесь в ASDTrecker",Toast.LENGTH_LONG).show();startActivity(new Intent(Settings.ACTION_SECURITY_SETTINGS));}});}
        @JavascriptInterface public void fetchRates(){if(!unlocked)return;io.execute(()->{HttpsURLConnection connection=null;try{connection=(HttpsURLConnection)new URL("https://open.er-api.com/v6/latest/USD").openConnection();connection.setConnectTimeout(8000);connection.setReadTimeout(10000);connection.setInstanceFollowRedirects(false);connection.setRequestMethod("GET");if(connection.getResponseCode()!=200)throw new IOException();String data=new String(readBounded(connection.getInputStream()),StandardCharsets.UTF_8);JSONObject json=new JSONObject(data);if(!"success".equals(json.optString("result"))||!"USD".equals(json.optString("base_code")))throw new IOException();callback("onNativeRates",data);}catch(Exception e){callback("onNativeRates","{\"result\":\"error\"}");}finally{if(connection!=null)connection.disconnect();}});}
        @JavascriptInterface public void exportBackup(String data){if(!unlocked||data==null||data.length()>MAX_BYTES)return;try{if(!new JSONObject(data).optString("format").equals("ASDTrecker-v1"))return;}catch(Exception e){return;}exportText=data;runOnUiThread(()->{Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT);i.addCategory(Intent.CATEGORY_OPENABLE);i.setType("application/octet-stream");i.putExtra(Intent.EXTRA_TITLE,"ASDTrecker-"+new java.text.SimpleDateFormat("yyyy-MM-dd",java.util.Locale.US).format(new java.util.Date())+".asdt");startActivityForResult(i,EXPORT);});}
        @JavascriptInterface public void pickBackup(){if(!unlocked)return;runOnUiThread(()->{Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT);i.addCategory(Intent.CATEGORY_OPENABLE);i.setType("*/*");startActivityForResult(i,IMPORT);});}
        @JavascriptInterface public void exitApp(){runOnUiThread(()->finish());}
    }
    @Override protected void onActivityResult(int request,int result,Intent data){
        super.onActivityResult(request,result,data);
        if(request==AUTH){authenticating=false;if(result==RESULT_OK)unlock();else{unlocked=false;cover.setVisibility(View.VISIBLE);/* Avoid immediately reopening after cancellation. */authenticating=true;web.postDelayed(()->authenticating=false,750);}return;}
        if(request==EXPORT){String payload=exportText;exportText=null;if(result==RESULT_OK&&data!=null&&data.getData()!=null&&payload!=null){Uri uri=data.getData();io.execute(()->{try(OutputStream out=getContentResolver().openOutputStream(uri,"wt")){if(out==null)throw new IOException();out.write(payload.getBytes(StandardCharsets.UTF_8));runOnUiThread(()->Toast.makeText(this,"Зашифрованная копия сохранена",Toast.LENGTH_LONG).show());}catch(Exception e){runOnUiThread(()->Toast.makeText(this,"Не удалось сохранить копию",Toast.LENGTH_LONG).show());}});}return;}
        if(request==IMPORT&&result==RESULT_OK&&data!=null&&data.getData()!=null){Uri uri=data.getData();io.execute(()->{try{String text=new String(readBounded(getContentResolver().openInputStream(uri)),StandardCharsets.UTF_8);runOnUiThread(()->{if(unlocked)callback("onBackupPicked",text);else pendingImport=text;});}catch(Exception e){runOnUiThread(()->Toast.makeText(this,"Не удалось открыть файл",Toast.LENGTH_LONG).show());}});}
    }
    @Override public void onBackPressed(){if(unlocked&&loaded)web.evaluateJavascript("window.onAndroidBack && window.onAndroidBack()",null);else finish();}
    @Override protected void onDestroy(){io.shutdownNow();web.removeJavascriptInterface("Android");web.destroy();super.onDestroy();}
}
