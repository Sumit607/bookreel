# window.BookreelAndroid: the web app calls these methods by name, so R8 must keep them.
-keepclassmembers class app.bookreel.MainActivity$Bridge {
    @android.webkit.JavascriptInterface <methods>;
}
