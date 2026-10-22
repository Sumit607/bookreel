#!/usr/bin/env python3
"""Editorial pass on the Gemini conversion of The Art of War (Lionel Giles's 1910 translation, Gutenberg #132).

Gemini (free tier, gemini-3.5-flash-lite) wrote content/generated/the-art-of-war.gemini.json through the app's
own converter. A read-through against Giles's text found:
  - chapter titles and hook posts copied from the neighbouring chapter (the planner guessed wrong),
  - two posts where the model degenerated into repeated words, a stray Hindi word in a recap,
  - scenes that repeat a sentence, a few one-line or empty scenes, failed quizzes turned into scenes,
  - chat lines credited to a commentator that are really Sun Tzu's own words (or vice versa),
  - three chapters with no poll or quiz, and a guess loop whose question and answer did not match.
Everything else is kept as Gemini wrote it. Run:

    python3 content/src/aow_edits.py      # writes the edited pack, then imports it into the library

"""
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, "content", "generated", "the-art-of-war.gemini.json")
OUT = os.path.join(ROOT, "content", "generated", "the-art-of-war.edited.json")

HINT_POLL = "Pick one to see what actually happened."

def scene(t, label, text, theme="paper"):
    return {"type": "scene", "t": t, "label": label, "text": text, "theme": theme}

def poll(t, q, options, reveal, label="You decide"):
    return {"type": "poll", "t": t, "label": label, "q": q, "options": [{"text": a, "feedback": b} for a, b in options], "reveal": reveal, "hint": HINT_POLL}

def hook(t, kicker, head, sub, art, art_text=None):
    h = {"type": "hook", "t": t, "kicker": kicker, "head": head, "sub": sub, "art": art}
    if art_text:
        h["artText"] = art_text
    return h

def chat(t, label, msgs):
    return {"type": "chat", "t": t, "label": label, "msgs": [{"who": w, "text": x} for w, x in msgs]}

def idea(t, label, head, sub, theme="sodium", **extra):
    return {"type": "idea", "t": t, "label": label, "head": head, "sub": sub, "theme": theme, **extra}

def check_list(t, label, h, items, text=""):
    return {"type": "list", "t": t, "label": label, "h": h, "items": [{"text": a, "state": s} for a, s in items], "style": "check", "theme": "paper", "text": text}

def receipt(t, label, h, items, total, text=""):
    return {"type": "list", "t": t, "label": label, "h": h, "items": [{"text": a, "value": v} for a, v in items], "style": "receipt", "theme": "steel", "total": total, "text": text}

def crossoff(t, title, items, answer):
    return {"type": "crossoff", "t": t, "title": title, "items": [{"text": a, "why": b} for a, b in items], "answer": answer}

def cliff(text, t="To be continued"):
    return {"type": "cliffhanger", "t": t, "text": text}

# Per chapter: new title, teaser (chapter hook), recap, and posts to replace (1-based index) or patch.
EDITS = {
    1: {
        "title": "Before the Book",
        "hook": "A botched French version, a doubted general, and a king who lost two favourite concubines to a drill lesson.",
        "posts": {
            1: hook("Before the Book", "London, 1910", "The world's oldest war manual finally gets an honest translation.",
                    "Lionel Giles fixes a century of blunders, then retells how Sun Tzu won his job with 180 palace women.",
                    "stamp", "TRANSLATED|LIONEL GILES, 1910"),
            2: {"head": "A Loose French Version", "sub": "In 1782 the Jesuit Joseph Amiot published Sun Tzu in French. Giles judged that it contained much Sun Tzu never wrote."},
            3: {"label": "Tokyo 1905, London 1908"},
            5: {"label": "British Museum", "foot": None},
            7: {"label": "The Palace", "foot": None},
            8: {"head": "Was Sun Wu Real?"},
            10: cliff("But how did a book this old survive at all? Copyists garbled it, encyclopedias scattered it, and one lucky find in a temple library saved it."),
        },
    },
    2: {
        "title": "How the Text Survived",
        "hook": "Lost editions, a find in a mountain temple, and eleven commentators arguing over every line.",
        "posts": {
            1: hook("How the Text Survived", "Centuries of copying", "For centuries, copyists slowly garbled Sun Tzu's thirteen chapters.",
                    "Then an antiquarian found a lost edition in a temple library, and the commentators got to work.",
                    "stamp", "FOUND|IN A TEMPLE LIBRARY"),
            4: {"label": "Sources"},
            9: {"label": "Further Reading"},
            3: {"text": "Sun Hsing-yen, an 18th-century antiquarian, visits the library of the Hua-yin temple on a sacred mountain. By chance he finds a copy of Chi T'ien-pao's long-lost edition, with the I Shuo appended. With it, scholars can restore the corrupted text of Sun Tzu to something close to its original state."},
        },
    },
    3: {
        "title": "Laying Plans",
        "hook": "War is life or death for a state, so Sun Tzu wins it first in the temple, with five factors and seven questions.",
        "recap": ["Sun Tzu weighs five constant factors before any war.", "Seven questions predict which side will win.", "All warfare is based on deception."],
        "posts": {
            1: hook("Laying Plans", "Chapter I", "War is a matter of life and death. Count before you fight.",
                    "Five constant factors and seven questions decide a war before the first arrow flies.", "countdown", "5|CONSTANT FACTORS"),
            3: {"head": "Five Constant Factors", "sub": "The Moral Law, Heaven, Earth, the Commander, and Method and discipline. The general who knows them will win; the one who does not will lose."},
            8: scene("Heed My Counsel", "A Warning to the King",
                     "Sun Tzu ends with a word for the king himself. A general who heeds this counsel and acts on it will conquer: keep him in command. One who ignores it will be defeated: dismiss him. And beyond the rules, a good general turns every helpful circumstance to account, shaping his plans as events unfold."),
            9: scene("The Commander", "The Fourth Factor",
                     "Of the five factors, the Commander stands for five virtues: wisdom, sincerity, benevolence, courage and strictness. The Moral Law, Sun Tzu explains, is what puts the people in complete accord with their ruler, so that they will follow him undismayed by any danger, in life or in death."),
        },
    },
    4: {
        "title": "Waging War",
        "hook": "Every day of war costs a thousand ounces of silver. Sun Tzu's answer: be quick, and let the enemy feed you.",
        "posts": {
            1: hook("Waging War", "Chapter II", "A hundred thousand men cost a thousand ounces of silver a day.",
                    "So Sun Tzu wants wars short, fed by the enemy, and won without a siege.", "countdown", "1,000|OUNCES OF SILVER A DAY"),
            3: {"head": "Stupid Haste Beats Clever Delay"},
            6: {"head": "Victory, Not Long Campaigns", "sub": "In war, let your great object be victory, not lengthy campaigns. The general who understands this is the arbiter of the people's fate."},
        },
    },
    5: {
        "title": "Tactical Dispositions",
        "hook": "The best generals win before the battle: they make themselves unbeatable, then wait for the enemy's mistake.",
        "posts": {
            1: hook("Tactical Dispositions", "Chapters III and IV", "Know the enemy and know yourself, and you need not fear a hundred battles.",
                    "Then make yourself unbeatable, and wait for the enemy to give you your chance.", "stamp", "UNBEATABLE|FIRST, THEN WAIT"),
            5: scene("Defend or Attack?", "Defend or Attack?",
                     "Security against defeat means defensive tactics; the power to defeat the enemy means taking the offensive. Standing on the defensive shows that your strength is not yet enough; attacking shows a superabundance of it. The general who cannot yet win waits, unbeatable. The one who can win, strikes."),
            7: poll("No Applause", "A general wins a victory that the whole empire cheers. Is that the height of excellence?",
                    [("Yes, it's a triumph", "Sun Tzu disagrees: that is not the acme of excellence."), ("No", "Right. The best victories look easy and win no praise.")],
                    "A victory the common herd can see, or one the whole Empire applauds, is not the acme of excellence. The clever fighter wins with ease, and earns no name for wisdom or courage."),
            9: {"label": "Five Steps"},
        },
    },
    6: {
        "title": "Energy",
        "hook": "How does a general turn a crowd of soldiers into a boulder rolling down a mountain? With order, surprise and timing.",
        "posts": {
            1: hook("Energy", "Chapter V", "Energy is a bent crossbow. Decision is the release of the trigger.",
                    "Direct and indirect moves, combined without end, turn an army into a rolling boulder.", "peaks", "THE ROLLING STONE|day"),
        },
    },
    7: {
        "title": "Weak Points and Strong",
        "hook": "Arrive first, stay invisible, and strike where the enemy is weak: an army should move like water.",
        "posts": {
            1: hook("Weak Points and Strong", "Chapter VI", "Be first on the field, and make the enemy come to you.",
                    "Strike where he is weak, hide where you are strong, and flow like water.", "stamp", "WATER|HAS NO CONSTANT SHAPE"),
            5: scene("Many Against Few", "Many Against Few",
                     "If we can see the enemy's dispositions while staying invisible ourselves, our forces stay concentrated while his must be divided. We form one body; he splits into ten. At the point we choose, we are many against his few. Forced to prepare everywhere, he is weak everywhere."),
        },
    },
    8: {
        "title": "Manoeuvring",
        "hook": "The hardest part of war is turning the long way round into the short way, without losing your army on the road.",
        "posts": {
            1: hook("Manoeuvring", "Chapter VII", "The hardest part of war: turning the long way round into the short way.",
                    "Race a hundred li for an advantage, and only one man in ten arrives.", "trail", "THE LONG WAY ROUND"),
            4: {"text": "What happens if you force-march a hundred li to snatch an advantage? The leaders of all three divisions fall into enemy hands. The strongest men arrive first, the weary straggle behind, and only one-tenth of the army reaches the goal."},
            8: check_list("Spoils", "Captured Territory", "Plunder, Sun Tzu's Way",
                          [("Divide the spoil among your men", "ok"), ("Cut new land into allotments for the soldiers", "ok"), ("Let plunder be a free-for-all", "no")],
                          "Commentators add that booty went into a common stock, to curb abuses."),
            9: scene("Ponder First", "Ponder and Deliberate",
                     "Ponder and deliberate before you make a move, Sun Tzu says: he will conquer who has learned the art of deviation. Show the enemy a long road, then arrive first by a short one. Rush ahead without baggage and you lose your stores; drag everything along and you arrive too late."),
            10: cliff("One problem remains. On a battlefield full of noise and dust, how does one man's will reach every soldier at once?"),
        },
    },
    9: {
        "title": "Drums and Banners",
        "hook": "In battle no voice carries far enough. Sun Tzu's answer is drums, banners, and a close watch on the enemy's spirit.",
        "posts": {
            1: hook("Drums and Banners", "Chapter VII", "In battle the voice does not carry. So the general uses drums and banners.",
                    "Then he reads the enemy's spirit: keen at dawn, flagging by evening.", "drum"),
            2: scene("Gongs and Drums", "The Ancient Field",
                     "On the field of battle the spoken word does not carry far enough, so armies use gongs and drums. Ordinary objects cannot be seen clearly enough, so they use banners and flags. These fix the eyes and ears of the whole host on one point. Then the brave cannot advance alone, nor the cowardly retreat alone."),
            5: check_list("Never Do These", "Military Axioms", "Never Do These",
                          [("Attack uphill against the enemy", "no"), ("Pursue a feigned flight", "no"), ("Swallow a bait the enemy offers", "no")],
                          "Each one is a trap the enemy would love you to walk into."),
            6: scene("Homeward Bound", "Mountain Pass",
                     "Do not interfere with an army that is returning home. A soldier longing for home fights with desperate fury against anyone who blocks his road, so he makes too dangerous an opponent to tackle."),
            7: scene("A Bait, Not a Banquet", "The Commentators",
                     "“Do not swallow bait offered by the enemy.” Two commentators, Li Ch'uan and Tu Mu, took this literally, as food and drink the enemy had poisoned. Giles teases them for missing the metaphor: Ch'en Hao and Chang Yu point out that it covers any lure the enemy dangles."),
            8: scene("Leave a Way Out", "The Besieged City",
                     "When you surround an army, leave an outlet free. Do not press a desperate foe too hard. A cornered enemy fights with the courage of despair; give him a road out, and that courage drains away."),
            9: chat("Self-Possession", "The Art of Self-Possession", [
                ("sunzi", "Disciplined and calm, wait for disorder and hubbub among the enemy. That is self-possession."),
                ("sunzi", "Be near the goal while he is still far from it, at ease while he toils, well fed while he is famished."),
                ("sunzi", "That is the art of husbanding your strength."),
            ]),
        },
    },
    10: {
        "title": "Variation of Tactics",
        "hook": "Some roads must not be taken and some royal orders must not be obeyed. And every general carries five fatal faults.",
        "posts": {
            1: hook("Variation of Tactics", "Chapter VIII", "Some roads must not be taken, and some royal orders must not be obeyed.",
                    "A general must weigh gain and harm together, and know his own five fatal faults.", "chain", "FIVE DANGEROUS FAULTS"),
            4: {"text": "What if the sovereign's command clashes with the army's safety? Sun Tzu lists “commands of the sovereign which must not be obeyed.” Commentators explain that the general in the field sees what the court cannot, and blind obedience can destroy an army.", "label": "The Sovereign's Order"},
            5: poll("Readiness", "The enemy probably won't attack today. What should a general count on?",
                    [("His likely absence", "Sun Tzu: never rely on the enemy not coming."), ("His own readiness", "Right. Make your position unassailable.")],
                    "Rely not on the likelihood of the enemy not coming, but on your own readiness to receive him; not on the chance of his not attacking, but on having made your position unassailable."),
            7: scene("Five Sins", "Five Besetting Sins",
                     "These five besetting sins of a general are ruinous to the conduct of war. When an army is overthrown and its leader slain, Sun Tzu says, the cause will surely be found among them. Let them be a subject of meditation."),
            8: check_list("Five Faults", "The Five Dangerous Faults", "The Five Dangerous Faults",
                          [("Recklessness, which leads to destruction", "no"), ("Cowardice, which leads to capture", "no"), ("A hasty temper, provoked by insults", "no"),
                           ("A delicacy of honour, sensitive to shame", "no"), ("Over-solicitude for his men", "warn")],
                          "Any one of them can ruin a general."),
        },
    },
    11: {
        "title": "The Army on the March",
        "hook": "Camp high, face the sun, cross rivers carefully, and let the birds and the dust tell you where the enemy is.",
        "recap": ["Sun Tzu details rules for camping and crossing rivers.", "High, sunny, healthy camps keep an army fit.", "Dust, birds and moving trees give the enemy away."],
        "posts": {
            1: hook("The Army on the March", "Chapter IX", "Camp high, face the sun, and never fight uphill.",
                    "Then read the land itself: rising birds, startled beasts and dust tell you what the enemy is doing.", "peaks", "CAMP HIGH, FACE THE SUN|day"),
            3: {"msgs": [{"who": "sunzi", "text": "After crossing a river, get far away from it."},
                         {"who": "sunzi", "text": "When the enemy crosses a river to meet you, let half his army get across, then attack."},
                         {"who": "sunzi", "text": "Moor your craft higher up than the enemy, facing the sun. Do not move upstream to meet him."}]},
            5: scene("Healthy Camps", "Choosing the Camp",
                     "All armies prefer high ground to low, and sunny places to dark. Camp on hard ground and take care of your men, and the army will be free from disease of every kind: this, Sun Tzu says, spells victory. Near a hill or a bank, occupy the sunny side, with the slope behind you."),
            7: {"msgs": [{"who": "sunzi", "text": "When the enemy is close at hand and stays quiet, he is relying on the natural strength of his position."},
                         {"who": "sunzi", "text": "Movement among the trees of a forest shows that the enemy is advancing."},
                         {"who": "sunzi", "text": "The rising of birds in their flight is the sign of an ambuscade."}]},
            8: poll("Reading Dust", "A column of dust rises on the horizon, high and sharp. What is coming?",
                    [("Chariots", "Right. High, sharp dust means chariots."), ("Infantry", "Infantry raise dust that is low and spread out.")],
                    "When the dust rises high in a column, chariots are advancing; when it is low and spread over a wide area, infantry are approaching.", label="Reading the land"),
            10: cliff("The land has given the enemy away. Next, Sun Tzu reads the enemy's own soldiers: how they lean, drink, shout and send envoys."),
        },
    },
    12: {
        "title": "Reading the Enemy",
        "hook": "Soldiers leaning on their spears, men drinking first, envoys full of compliments: every sign tells a story.",
        "posts": {
            1: hook("Reading the Enemy", "Chapter IX", "When soldiers lean on their spears, they are faint from hunger.",
                    "Sun Tzu reads a whole army from small signs, then explains how to command one.", "stamp", "SIGNS|READ THE ENEMY"),
            3: scene("Scouting Test", "Scouting Test",
                     "What does it mean if the enemy sees an advantage and makes no effort to take it? His soldiers are exhausted. Sun Tzu reads the same story in other signs: clamour by night betrays nervousness, disturbance in the camp means the general's authority is weak, and shifting banners mean sedition is afoot."),
            5: chat("Signs of Intent", "Signs of Intent", [
                ("sunzi", "To begin with bluster, then take fright at the enemy's numbers, shows a supreme lack of intelligence."),
                ("sunzi", "Envoys sent with compliments in their mouths mean the enemy wants a truce."),
                ("sunzi", "If his troops march up angrily and stay facing ours without fighting or leaving, watch them closely."),
            ]),
            8: check_list("Command", "General's Checklist", "Commanding Men",
                          [("Win the men's attachment first", "ok"), ("Then enforce iron discipline", "ok"), ("Insist that every order is obeyed", "ok")],
                          "Confidence on both sides, Sun Tzu says, means the gain is mutual."),
            9: {"sub": "A commentator sums it up: the art of giving orders is not to fuss over minor blunders, nor to be swayed by petty doubts."},
        },
    },
    13: {
        "title": "Terrain",
        "hook": "Six kinds of ground and six calamities, and not one of the calamities comes from heaven.",
        "posts": {
            1: hook("Terrain", "Chapter X", "Six kinds of ground, and six ways a general can lose his army.",
                    "None of the six calamities comes from heaven. Every one is the general's fault.", "peaks", "SIX KINDS OF GROUND|day"),
            2: scene("Six Kinds of Ground", "The Field",
                     "Sun Tzu names six kinds of terrain: accessible ground, entangling ground, temporising ground, narrow passes, precipitous heights, and positions far from the enemy. Each asks something different. On accessible ground, seize the raised and sunny spots first and guard your supply line; on temporising ground, neither side gains by moving first."),
            5: check_list("Six Calamities", "Six Calamities", "Six Calamities",
                          [("Flight", "no"), ("Insubordination", "no"), ("Collapse", "no"), ("Ruin", "no"), ("Disorganisation", "no"), ("Rout", "no")],
                          "None comes from natural causes; each is the general's fault."),
            6: {"text": "Regard your soldiers as your children, and they will follow you into the deepest valleys; look on them as your own beloved sons, and they will stand by you even unto death. The general Wu Ch'i, commentators recall, even sucked the poison from a common soldier's sore."},
            9: {"label": "Whose Fault?"},
        },
    },
    14: {
        "title": "The Nine Situations",
        "hook": "Nine kinds of ground, from home soil to desperate ground with no way out, and a rule for each.",
        "posts": {
            1: hook("The Nine Situations", "Chapter XI", "Nine kinds of ground, from home soil to a trap with no way out.",
                    "On each, Sun Tzu gives one rule. On the last: fight.", "desert", "DESPERATE GROUND"),
            4: scene("Facile Ground", "Facile Ground",
                     "When you have gone only a short way into enemy country, you are on facile ground: do not halt there. Commentators add that some generals burned their boats and bridges behind them, so that no one could dream of going home."),
            6: scene("Serious and Difficult", "Serious and Difficult Ground",
                     "Serious ground lies deep in enemy country, with many fortified cities behind you: there, gather in plunder to feed the army. Difficult ground means mountain forests, steep passes, marshes and fens: keep steadily on the march, and never camp there."),
            9: {"msgs": [{"who": "sunzi", "text": "Begin by seizing something which your opponent holds dear."},
                         {"who": "sunzi", "text": "Then he will be amenable to your will."}]},
            10: cliff("On desperate ground, men fight. But why do they fight hardest when there is no way out, and how far into enemy country should a general dare to take them?"),
        },
    },
    15: {
        "title": "Deep Penetration",
        "hook": "The deeper an army goes into enemy country, the more united it becomes, and the harder it fights.",
        "posts": {
            1: hook("Deep Penetration", "Chapter XI", "Throw soldiers where there is no escape, and they will prefer death to flight.",
                    "So Sun Tzu leads his army deep into enemy land, where every man must fight.", "stamp", "NO RETREAT|DEEP IN ENEMY LAND"),
            4: {"payoffLoopId": None},
            7: {"msgs": [{"who": "sunzi", "text": "The men of Wu and the men of Yueh are enemies."},
                         {"who": "sunzi", "text": "Yet if they cross a river in the same boat and are caught by a storm, they will help each other."},
                         {"who": "sunzi", "text": "Just as the left hand helps the right."}]},
            10: cliff("Danger has bound the army into one body. But how much of his plan should a general let his own men see? Sun Tzu's answer is startling."),
        },
    },
    16: {
        "title": "Commanding the Host",
        "hook": "A great general leads his army like a single man by the hand, and tells it nothing.",
        "posts": {
            1: hook("Commanding the Host", "Chapter XI", "He leads his army like one man, by the hand, and tells it nothing.",
                    "Then he climbs a height and kicks the ladder away.", "fog", "IN THE DARK"),
            4: scene("Pan Ch'ao's Trick", "Central Asia",
                     "Commentators tell how the Han general Pan Ch'ao, badly outnumbered, announced that his forces would split up and scatter. He let prisoners escape to carry the news. The enemy divided to chase the retreat; Pan Ch'ao then hurled his united force at their camp and routed it."),
            7: receipt("On Each Ground", "Ground Adaptations", "On Each Ground",
                       [("Dispersive ground", "Unite their purpose"), ("Contentious ground", "Hurry up the rear"), ("Hemmed-in ground", "Block retreat"), ("Desperate ground", "Show there's no way out")],
                       "Nine kinds", "Sun Tzu's orders for the men on each kind of ground."),
            9: {"label": "Penetration", "mid": "vs"},
            8: scene("Even Your Own Side", "Even Your Own Side",
                     "All warfare is based on deception, and Sun Tzu applies the rule at home too. He alters his arrangements and changes his plans, so that no one can be sure of his purpose. He shifts camp and takes roundabout routes, so the enemy cannot anticipate where he is going."),
            10: cliff("The deeper the army goes, the stronger it gets. But how should a general take on a powerful state, and what must he do on the very day he takes command?"),
        },
    },
    17: {
        "title": "Coy as a Maiden",
        "hook": "Sun Tzu's last lessons on invading: how to take on a great power, and what to do the day you take command.",
        "posts": {
            1: hook("Coy as a Maiden", "Chapter XI", "At first, be as coy as a maiden. Then strike like a running hare.",
                    "Sun Tzu's last lessons on invading a great power, and on the day you take command.", "stamp", "MAIDEN|THEN A RUNNING HARE"),
            2: scene("Human Nature", "Human Nature",
                     "It is the soldier's nature to resist stubbornly when surrounded, to fight hard when he cannot help himself, and to obey promptly once he has fallen into danger. A general who understands this can lead men anywhere: danger itself binds them to him."),
            3: scene("Against a Great Power", "Against a Great Power",
                     "When a warlike prince attacks a powerful state, his generalship shows in one thing: he stops the enemy's forces from concentrating. He overawes his opponents, so that their allies are prevented from joining against him."),
            5: crossoff("Day One", "On the day you take command, what comes first?",
                        [("Send envoys to the enemy", "Sun Tzu stops all emissaries."), ("Hold an open war council", "He wants the council stern and secret."), ("Wait for reinforcements", "If the enemy leaves a door open, he rushes in.")],
                        "Close the frontier passes"),
            6: scene("Taking Command", "The Day You Take Command",
                     "On the day you take up your command, block the frontier passes, destroy the official tallies, and stop all emissaries. Be stern in the council-chamber, so that you control the situation. And if the enemy leaves a door open, rush in."),
            7: "orig:7",
            8: "orig:9",
            9: "orig:5",
            10: cliff("Sun Tzu has one weapon left that needs no soldiers at all: fire. But fire obeys the wind, and the wind obeys the season. When should a general strike?"),
        },
    },
    18: {
        "title": "The Attack by Fire",
        "hook": "Five ways to attack with fire, the right days to do it, and a warning: never go to war out of anger.",
        "posts": {
            1: hook("The Attack by Fire", "Chapter XII", "Five ways to attack with fire, and one warning about anger.",
                    "A kingdom once destroyed can never come back. So never go to war out of spleen.", "stamp", "FIRE|ONLY WHEN THE WIND RISES"),
            4: poll("Calm in the Flames", "Fire breaks out in the enemy camp, but his soldiers stay calm. What do you do?",
                    [("Charge while it burns", "Calm soldiers may be ready for you. Sun Tzu waits."), ("Bide your time", "Right. Calm means they may be ready.")],
                    "Bide your time and do not attack. When the flames are at their height, follow up with an attack if you can; if not, stay where you are."),
            7: {"label": "Restraint"},
            10: cliff("Fire wins battles. But Sun Tzu's last chapter is about a cheaper weapon that wins wars before they begin, and costs only silver: people who know the enemy's secrets."),
        },
    },
    19: {
        "title": "The Use of Spies",
        "hook": "A war costs a thousand ounces of silver a day. Grudging a hundred for spies, Sun Tzu says, is the height of inhumanity.",
        "posts": {
            1: hook("The Use of Spies", "Chapter XIII", "Foreknowledge cannot come from spirits. It must come from men.",
                    "Which is why Sun Tzu's last chapter is about spies.", "house"),
            3: idea("Foreknowledge", "Strategy", "Why Wise Generals Win",
                    "What lets a wise ruler and a good general strike, conquer and achieve things beyond the reach of ordinary men is foreknowledge."),
            4: poll("Worth the Silver?", "A war costs a thousand ounces of silver a day. Are a hundred ounces for spies worth it?",
                    [("No, save the silver", "Sun Tzu calls that the height of inhumanity."), ("Yes, spend it", "Right. Knowing the enemy shortens wars.")],
                    "Armies may face each other for years, striving for a victory decided in a single day. To stay ignorant of the enemy because you grudge a hundred ounces of silver is, Sun Tzu says, the height of inhumanity."),
            6: receipt("Five Kinds", "The Five Kinds of Spy", "The Five Kinds of Spy",
                       [("Local spies", "People of the district"), ("Inward spies", "Enemy officials"), ("Converted spies", "Enemy spies we turn"), ("Doomed spies", "Carry false news"), ("Surviving spies", "Bring news back")],
                       "5 kinds", "Use all five together and no one can discover the system."),
            7: {"type": "guess", "t": "Your guess", "label": "Your guess", "q": "Of the five kinds of spy, which one makes all the others possible?",
                "options": [{"text": "The local spy", "feedback": "Hold that thought."}, {"text": "The converted spy", "feedback": "Hold that thought."},
                            {"text": "The surviving spy", "feedback": "Hold that thought."}],
                "reveal": "The answer comes in Chapter 20.", "hint": "Pick your answer. We’ll keep it for Chapter 20.", "loopId": "keyspy"},
        },
    },
    20: {
        "title": "The Converted Spy",
        "hook": "Turn one enemy spy, and every other kind becomes possible. Then Sun Tzu ends with a warning.",
        "posts": {
            1: hook("The Converted Spy", "Chapter XIII", "Turn one enemy spy, and every other kind of spy becomes possible.",
                    "Sun Tzu's last chapter ends with a warning: spies can sink you too.", "countdown", "5|KINDS OF SPY"),
            3: scene("Handling Spies", "Handling Spies",
                     "Spies cannot be usefully employed without intuitive sagacity, nor properly managed without benevolence and straightforwardness. Without subtle ingenuity of mind, Sun Tzu adds, a general cannot make certain of the truth of their reports. Be subtle, and use spies for every kind of business."),
            4: {"payoffLoopId": "keyspy", "label": "The answer"},
            6: crossoff("Rewards", "In the whole army, who should be rewarded most liberally?",
                        [("The generals", "Sun Tzu names someone else."), ("The bravest soldiers", "Not even them."), ("The scouts", "Close, but no.")],
                        "The spies"),
            8: {"sub": "Only the enlightened ruler and the wise general use the highest intelligence of the army for spying, and so achieve great results."},
            9: {"text": "A commentator adds a warning. Water carries a boat from bank to bank, but it can also sink it. In the same way, reliance on spies can bring great results, and can just as often be the cause of utter destruction."},
            10: cliff("Thirteen chapters, written some 2,500 years ago, end here. Sun Tzu's whole lesson fits in one line: win before you fight, and fight only when you must.", t="The end"),
        },
    },
}

CHARACTER_FIXES = {
    "sunzi": {"name": "Sun Tzu", "short": "Sun Tzu", "initials": "ST", "role": "General and author",
              "bio": "A general from the state of Ch'i who served King Ho Lu of Wu. His thirteen chapters are the oldest military treatise in the world."},
}

NAME_FIXES = [("Sun Tzŭ", "Sun Tzu"), ("Sun Tzũ", "Sun Tzu"), ("Sunzi", "Sun Tzu"), ("Manœuvering", "Manoeuvring"), ("manœuvering", "manoeuvring"),
              ("Manœuvring", "Manoeuvring"), ("manœuvers", "manoeuvres"), ("manœuvre", "manoeuvre")]


def fix_names(o):
    if isinstance(o, str):
        for a, b in NAME_FIXES:
            o = o.replace(a, b)
        return o
    if isinstance(o, list):
        return [fix_names(x) for x in o]
    if isinstance(o, dict):
        return {k: fix_names(v) for k, v in o.items()}
    return o


def main():
    with open(SRC, encoding="utf-8") as f:
        pack = json.load(f)
    for n, e in EDITS.items():
        ch = pack["chapters"][n - 1]
        ch["title"] = e["title"]
        ch["hook"] = e["hook"]
        if "recap" in e:
            ch["recap"] = e["recap"]
        orig = [dict(p) for p in ch["posts"]]
        for i, rep in e["posts"].items():
            if isinstance(rep, str) and rep.startswith("orig:"):
                ch["posts"][i - 1] = orig[int(rep[5:]) - 1]
            elif rep.get("type"):
                ch["posts"][i - 1] = rep
            else:
                p = ch["posts"][i - 1]
                for k, v in rep.items():
                    if v is None:
                        p.pop(k, None)
                    else:
                        p[k] = v
    for c in pack["characters"]:
        c.update(CHARACTER_FIXES.get(c["id"], {}))
    pack = fix_names(pack)
    pack.update({"title": "The Art of War", "authors": ["Sun Tzu"], "category": "Strategy",
                 "blurb": "Thirteen short chapters on winning, written about 2,500 years ago, in Lionel Giles's 1910 translation."})
    # nothing the model degenerated into may survive
    text = json.dumps(pack, ensure_ascii=False)
    bad = [w for w in ("truly sure", "[Lionel Giles", "will be revealed in", "This answer comes", "पांच") if w in text]
    if bad:
        sys.exit(f"left-over model artefacts: {bad}")
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(pack, f, ensure_ascii=False, indent=1)
    print("edited pack ->", os.path.relpath(OUT, ROOT))
    r = subprocess.run([sys.executable, os.path.join(ROOT, "tools", "import_bookreel.py"), OUT, "the-art-of-war",
                        "--source", "Project Gutenberg #132", "--year", "1910", "--translator", "Lionel Giles",
                        "--authors", "Sun Tzu", "--title", "The Art of War"])
    return r.returncode


if __name__ == "__main__":
    sys.exit(main())
