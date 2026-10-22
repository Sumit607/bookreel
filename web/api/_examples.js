// Example chapters shown to the writer model so it aims at the quality and variety of Bookreel's hand-made books.
// story: chapter 1 of A Study in Scarlet as published in the app. ideas: a model chapter for a book of ideas (Walden).
// The prompt tells the model never to reuse their content.
module.exports = {
 "story": {
  "book": "A Study in Scarlet by Arthur Conan Doyle",
  "characters": [
   "watson: Dr John H. Watson",
   "stamford: Stamford",
   "holmes: Sherlock Holmes"
  ],
  "chapter": {
   "title": "Home from the War",
   "hook": "A bullet at Maiwand sent him home with nothing. A tap on the shoulder in a London bar changed everything.",
   "recap": [
    "Watson is wounded at Maiwand and sent home sick.",
    "Broke in London, he needs cheap rooms to share.",
    "Stamford knows a man: brilliant, odd, and named Sherlock Holmes."
   ],
   "posts": [
    {
     "type": "hook",
     "t": "Invalided home",
     "kicker": "Afghanistan, 1880",
     "head": "A bullet sent him home with nothing.",
     "sub": "Then a chance meeting in a London bar handed him a flatmate, and a whole new life.",
     "art": "stamp",
     "artText": "INVALIDED|HOME FROM AFGHANISTAN"
    },
    {
     "type": "scene",
     "t": "Meet Dr Watson",
     "label": "Meet John H. Watson · Army surgeon",
     "h": "Struck at Maiwand",
     "text": "He trained as a doctor in London, joined the army as an assistant surgeon and was sent to the Second Afghan War. At the battle of Maiwand a bullet smashed his shoulder. His orderly, Murray, threw him across a packhorse and got him back to British lines alive.",
     "theme": "paper"
    },
    {
     "type": "twist",
     "t": "Then the fever",
     "head": "Then the fever came.",
     "text": "Recovering in hospital at Peshawar, he caught enteric fever, typhoid, and nearly died. A medical board shipped him home on the troopship Orontes. He landed at Portsmouth with his health in ruins and nine months to repair it.",
     "status": "Health · Wrecked"
    },
    {
     "type": "scene",
     "t": "Adrift in London",
     "label": "London",
     "h": "Money running out",
     "text": "No family, no friends, and an army pension of eleven shillings and sixpence a day. Watson drifts to London, which he calls the great cesspool of the Empire, and lives in a hotel in the Strand, spending far more than he has. Soon the sums stop adding up.",
     "theme": "night"
    },
    {
     "type": "poll",
     "t": "You decide: Watson",
     "label": "You decide",
     "q": "You’re Watson: broke, alone and living in a hotel. What now?",
     "options": [
      {
       "text": "Move to a cheap village in the country",
       "feedback": "Watson considered exactly that. Then his luck changed."
      },
      {
       "text": "Find cheaper rooms in London, and share them",
       "feedback": "That’s Watson’s choice. And that same day, he meets an old friend."
      },
      {
       "text": "Go back to the army as soon as possible",
       "feedback": "His health won’t allow it. The medical board has already sent him home."
      }
     ],
     "reveal": "He decides to find cheaper rooms. That very day, standing at the Criterion Bar, he feels a tap on his shoulder."
    },
    {
     "type": "chat",
     "t": "The Criterion Bar",
     "label": "The Criterion Bar · Piccadilly",
     "msgs": [
      {
       "who": "stamford",
       "text": "Watson? You’re as thin as a rail and brown as a nut. What happened to you?"
      },
      {
       "who": "watson",
       "text": "Afghanistan. Now I’m hunting for rooms I can actually afford."
      },
      {
       "who": "stamford",
       "text": "Funny. You’re the second person to say that to me today."
      },
      {
       "who": "watson",
       "text": "Who was the first?"
      },
      {
       "who": "stamford",
       "text": "A fellow in the chemistry lab at the hospital. He’s found nice rooms and can’t afford them alone."
      },
      {
       "who": "watson",
       "text": "Then I’m his man. I’d rather have company than live alone."
      },
      {
       "who": "stamford",
       "text": "You don’t know Sherlock Holmes yet. You might not want him as a constant companion."
      }
     ]
    },
    {
     "type": "list",
     "t": "Stamford’s warning",
     "label": "Over lunch",
     "h": "Your future flatmate, according to Stamford",
     "items": [
      {
       "text": "A little odd in his ideas",
       "state": "warn"
      },
      {
       "text": "A first-class chemist",
       "state": "ok"
      },
      {
       "text": "Never took a proper medical course",
       "state": "warn"
      },
      {
       "text": "Knows strange things that would astonish his professors",
       "state": "warn"
      },
      {
       "text": "Beats dead bodies with a stick",
       "state": "no"
      }
     ],
     "text": "The stick is for science: he wants to know how far bruises can form after death. Stamford says he is a decent fellow, just a bit too cold-blooded about it.",
     "style": "check",
     "theme": "paper"
    },
    {
     "type": "myth",
     "t": "Watson the bumbler",
     "myth": "Watson is a slow-witted, bumbling sidekick.",
     "truth": "In the books he is a war surgeon who survived a battle and a fever. The bumbling Watson mostly comes from films made decades later."
    },
    {
     "type": "character",
     "t": "Meet Watson",
     "charId": "watson"
    },
    {
     "type": "cliffhanger",
     "t": "To be continued",
     "text": "Stamford leads him to the old hospital, up a bleak stone staircase and down a long whitewashed corridor to a lab full of bottles and flickering burners. One man is bent over a table. He looks up, and shouts with joy: “I’ve found it! I’ve found it!”"
    }
   ]
  }
 },
 "ideas": {
  "book": "Walden by Henry David Thoreau (part 1, from the chapter \"Economy\")",
  "characters": [
   "thoreau: Henry David Thoreau"
  ],
  "chapter": {
   "title": "Twenty-Eight Dollars",
   "hook": "A man builds a house for $28.12 to find out how little a life needs.",
   "recap": [
    "Thoreau borrows an axe and builds a one-room cabin by Walden Pond.",
    "He prices everything in hours of life, not dollars.",
    "Six weeks of work a year pays for all he needs."
   ],
   "posts": [
    {
     "type": "hook",
     "t": "Quiet desperation",
     "kicker": "Concord, Massachusetts, 1845",
     "head": "“The mass of men lead lives of quiet desperation.”",
     "sub": "So a 27-year-old borrows an axe, walks into the woods, and runs an experiment on his own life.",
     "art": "trail",
     "artText": "WALDEN POND"
    },
    {
     "type": "scene",
     "t": "The experiment",
     "label": "Walden Pond · March 1845",
     "text": "Henry David Thoreau borrows an axe and cuts tall white pines by the pond. He frames a one-room house, ten feet by fifteen, and moves in on the fourth of July. He wants to find out how little a life needs, and what is left once you stop chasing the rest.",
     "theme": "paper"
    },
    {
     "type": "idea",
     "t": "The real price",
     "label": "The idea",
     "head": "Things cost life, not money",
     "sub": "“The cost of a thing is the amount of what I will call life which is required to be exchanged for it.” A car is not its price. It is the years of work you trade for it.",
     "theme": "sodium"
    },
    {
     "type": "list",
     "t": "The bill",
     "label": "His own accounts",
     "h": "What the house cost",
     "style": "receipt",
     "items": [
      {
       "text": "Boards",
       "value": "$8.03"
      },
      {
       "text": "Old bricks",
       "value": "$4.00"
      },
      {
       "text": "Nails",
       "value": "$3.90"
      },
      {
       "text": "Two second-hand windows",
       "value": "$2.43"
      }
     ],
     "total": "$28.12 in all",
     "text": "A student's room at Harvard rents for $30 a year. His whole house costs less."
    },
    {
     "type": "poll",
     "t": "You decide",
     "label": "You decide",
     "q": "You earn more than you need. What would Thoreau do with the extra?",
     "options": [
      {
       "text": "Buy a bigger house",
       "feedback": "He'd say the house now owns you: more years of work to pay for it."
      },
      {
       "text": "Work less and keep the time",
       "feedback": "That's his answer: earn what you need, then spend the hours living."
      }
     ],
     "reveal": "He finds that about six weeks of work a year covers all his costs. The rest of the year is his, for reading, walking and writing."
    },
    {
     "type": "scene",
     "t": "Try it today",
     "label": "Try it today",
     "text": "Pick one thing you are saving for. Divide its price by what you earn in an hour. That is its price in Thoreau's currency: hours of your life. Some purchases still win. Many quietly don't.",
     "theme": "steel"
    },
    {
     "type": "compare",
     "t": "Two ways to live",
     "label": "Two ways to live",
     "h": "Who owns whom?",
     "leftTitle": "His neighbours",
     "left": [
      "Work to pay for the farm",
      "Buy what others buy",
      "No time to think"
     ],
     "rightTitle": "Thoreau",
     "right": [
      "Build only what he needs",
      "Work six weeks a year",
      "Keep the rest for living"
     ],
     "text": "He sees farmers who inherited land and barns as trapped by them: “men have become the tools of their tools.”"
    },
    {
     "type": "myth",
     "t": "The hermit myth",
     "myth": "Thoreau ran off to live as a hermit, cut off from everyone.",
     "truth": "He lives “a mile from any neighbor,” walks into Concord often, and writes the book because townspeople keep asking how he lives."
    },
    {
     "type": "crossoff",
     "t": "What you need",
     "title": "What does a life actually need?",
     "items": [
      {
       "text": "Fashionable clothes",
       "why": "“Beware of all enterprises that require new clothes.”"
      },
      {
       "text": "A bigger house",
       "why": "A shelter paid off in weeks beats a mansion paid off in decades."
      },
      {
       "text": "The newest invention",
       "why": "Inventions are often pretty toys that distract from serious things, he warns."
      }
     ],
     "answer": "Food, shelter, clothing, fuel"
    },
    {
     "type": "cliffhanger",
     "t": "Free for what?",
     "text": "He has a house for $28 and most of the year to himself. Now comes the harder question, the one money never answers: free to do what?"
    }
   ]
  }
 }
};
