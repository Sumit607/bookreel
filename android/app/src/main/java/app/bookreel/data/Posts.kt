package app.bookreel.data

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive

/** Every post has an id ("chapter-position"), a short title for the notebook and an optional takeaway. */
sealed interface Post {
    val id: String
    val t: String
    val take: String?
}

@Serializable
data class HookPost(
    override val id: String, override val t: String, override val take: String? = null,
    val kicker: String, val head: String, val sub: String, val art: String, val artText: String? = null,
) : Post

@Serializable
data class ScenePost(
    override val id: String, override val t: String, override val take: String? = null,
    val label: String, val h: String? = null, val text: String, val foot: String? = null,
    val extra: String? = null, val theme: String = "paper",
) : Post

@Serializable
data class ChatMsg(val who: String, val text: String)

@Serializable
data class ChatPost(
    override val id: String, override val t: String, override val take: String? = null,
    val label: String, val msgs: List<ChatMsg>,
) : Post

@Serializable
data class CharacterPost(
    override val id: String, override val t: String, override val take: String? = null,
    val charId: String,
) : Post

@Serializable
data class TwistPost(
    override val id: String, override val t: String, override val take: String? = null,
    val head: String, val text: String, val status: String,
) : Post

@Serializable
data class Option(val text: String, val feedback: String)

@Serializable
data class PollPost(
    override val id: String, override val t: String, override val take: String? = null,
    val label: String, val q: String, val options: List<Option>, val reveal: String, val hint: String,
) : Post

@Serializable
data class GuessPost(
    override val id: String, override val t: String, override val take: String? = null,
    val label: String, val q: String, val options: List<Option>, val reveal: String, val hint: String,
    val loopId: String,
) : Post

@Serializable
data class CrossItem(val text: String, val why: String)

@Serializable
data class CrossoffPost(
    override val id: String, override val t: String, override val take: String? = null,
    val title: String, val items: List<CrossItem>, val answer: String, val note: String = "",
) : Post

@Serializable
data class MythPost(
    override val id: String, override val t: String, override val take: String? = null,
    val myth: String, val truth: String,
) : Post

@Serializable
data class IdeaPost(
    override val id: String, override val t: String, override val take: String? = null,
    val label: String, val head: String, val sub: String, val visual: String? = null,
    val payoffLoopId: String? = null, val theme: String = "sodium",
) : Post

@Serializable
data class ListItem(val text: String, val state: String = "ok", val value: String? = null)

@Serializable
data class ListPost(
    override val id: String, override val t: String, override val take: String? = null,
    val label: String, val h: String, val items: List<ListItem>, val text: String = "",
    val style: String = "check", val total: String? = null, val theme: String = "paper",
) : Post

@Serializable
data class ComparePost(
    override val id: String, override val t: String, override val take: String? = null,
    val label: String, val h: String, val leftTitle: String, val left: List<String>,
    val rightTitle: String, val right: List<String>, val text: String, val mid: String = "?",
) : Post

@Serializable
data class RouteStep(val text: String, val state: String, val note: String? = null)

@Serializable
data class ArtifactPost(
    override val id: String, override val t: String, override val take: String? = null,
    val template: String, val label: String = "", val number: String = "", val badge: String = "",
    val route: List<RouteStep> = emptyList(), val text: String = "", val foot: String? = null,
) : Post

@Serializable
data class CliffPost(
    override val id: String, override val t: String, override val take: String? = null,
    val text: String,
) : Post

/** Fallback for a post type this app version does not know: shown as plain text, never a crash. */
data class UnknownPost(
    override val id: String, override val t: String = "", override val take: String? = null,
    val text: String,
) : Post

object PostDecoder {
    fun decode(json: Json, o: JsonObject): Post {
        val type = o["type"]?.jsonPrimitive?.contentOrNull
        return try {
            when (type) {
                "hook" -> json.decodeFromJsonElement(HookPost.serializer(), o)
                "scene" -> json.decodeFromJsonElement(ScenePost.serializer(), o)
                "chat" -> json.decodeFromJsonElement(ChatPost.serializer(), o)
                "character" -> json.decodeFromJsonElement(CharacterPost.serializer(), o)
                "twist" -> json.decodeFromJsonElement(TwistPost.serializer(), o)
                "poll" -> json.decodeFromJsonElement(PollPost.serializer(), o)
                "guess" -> json.decodeFromJsonElement(GuessPost.serializer(), o)
                "crossoff" -> json.decodeFromJsonElement(CrossoffPost.serializer(), o)
                "myth" -> json.decodeFromJsonElement(MythPost.serializer(), o)
                "idea" -> json.decodeFromJsonElement(IdeaPost.serializer(), o)
                "list" -> json.decodeFromJsonElement(ListPost.serializer(), o)
                "compare" -> json.decodeFromJsonElement(ComparePost.serializer(), o)
                "artifact" -> json.decodeFromJsonElement(ArtifactPost.serializer(), o)
                "cliffhanger" -> json.decodeFromJsonElement(CliffPost.serializer(), o)
                else -> unknown(o)
            }
        } catch (e: Exception) {
            unknown(o)
        }
    }

    private fun unknown(o: JsonObject): Post {
        val id = o["id"]?.jsonPrimitive?.contentOrNull ?: "?"
        val text = o["text"]?.jsonPrimitive?.contentOrNull ?: "This post needs a newer version of the app."
        return UnknownPost(id = id, text = text)
    }
}

/** Word count of a post's reading text, used by tests and the pipeline validator. */
fun Post.readingText(): String = when (this) {
    is HookPost -> "$head $sub"
    is ScenePost -> listOfNotNull(h, text, foot).joinToString(" ")
    is ChatPost -> msgs.joinToString(" ") { it.text }
    is CharacterPost -> ""
    is TwistPost -> "$head $text"
    is PollPost -> q + " " + options.joinToString(" ") { it.text }
    is GuessPost -> q + " " + options.joinToString(" ") { it.text }
    is CrossoffPost -> items.joinToString(" ") { it.text }
    is MythPost -> "$myth $truth"
    is IdeaPost -> "$head $sub"
    is ListPost -> h + " " + items.joinToString(" ") { it.text } + " " + text
    is ComparePost -> h + " " + (left + right).joinToString(" ") + " " + text
    is ArtifactPost -> route.joinToString(" ") { it.text } + " " + text + " " + (foot ?: "")
    is CliffPost -> text
    is UnknownPost -> text
}

val Post.isInteractive: Boolean get() = this is PollPost || this is GuessPost || this is CrossoffPost
