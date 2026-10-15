# kotlinx.serialization ships its own R8 rules; these keep our @Serializable models explicit.
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.**
-keepclassmembers @kotlinx.serialization.Serializable class app.bookreel.** {
    *** Companion;
    kotlinx.serialization.KSerializer serializer(...);
}
-keep,includedescriptorclasses class app.bookreel.**$$serializer { *; }
-keepclasseswithmembers class app.bookreel.** {
    kotlinx.serialization.KSerializer serializer(...);
}
