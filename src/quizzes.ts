import type { Quiz, QuizQuestion } from './shared';

// Starter quizzes loaded into a party that has none. Server-only: the client bundle must never import this file.

type Draft = Omit<QuizQuestion, 'id' | 'media'>;

const choice = (prompt: string, options: string[], correct: number, seconds = 20): Draft =>
	({ kind: 'choice', prompt, options, correct, answers: [], value: 0, seconds });
const typed = (prompt: string, answers: string[], seconds = 30): Draft =>
	({ kind: 'text', prompt, options: [], correct: 0, answers, value: 0, seconds });
const closest = (prompt: string, value: number, seconds = 25): Draft =>
	({ kind: 'number', prompt, options: [], correct: 0, answers: [], value, seconds });

const quiz = (id: string, title: string, questions: Draft[]): Quiz => ({
	id,
	title,
	category: title,
	reward: 5,
	questions: questions.map((q, i) => ({ ...q, id: `${id}-${i + 1}`, media: null })),
});

const STARTER: Quiz[] = [
	quiz('films', 'Films', [
		typed('What colour is the box in Mulholland Drive?', ['blue', 'azul']),
		closest('In The Shining, what room number is Danny told never to go into?', 237),
		typed('What is the memory-erasing company in Eternal Sunshine of the Spotless Mind called?', ['Lacuna', 'Lacuna Inc']),
		typed('Who directed Chungking Express and In the Mood for Love?', ['Wong Kar-wai', 'Wong Kar Wai', 'WKW']),
		typed('In Everything Everywhere All at Once, what do people have for fingers in one universe?', ['hot dogs', 'hot dog', 'hotdogs', 'salsichas']),
		typed('In The Lighthouse, what bird does Robert Pattinson’s character kill?', ['seagull', 'gull', 'gaivota']),
		typed('In Hereditary, what sound does Charlie keep making?', ['tongue click', 'click', 'clicking', 'clicks', 'cluck', 'tsk']),
		choice('Who directed Synecdoche, New York?', ['Spike Jonze', 'Michel Gondry', 'Charlie Kaufman', 'Paul Thomas Anderson'], 2),
		typed('In Blue Velvet, what does Jeffrey find lying in a field?', ['ear', 'an ear', 'severed ear', 'orelha']),
		typed('What is the forbidden area in Tarkovsky’s Stalker called?', ['The Zone', 'Zone', 'Zona']),
		typed('Who directed Perfect Blue and Paprika?', ['Satoshi Kon', 'Kon']),
		closest('How many years is Dae-su locked up in Oldboy?', 15),
		typed('Which director’s Dune never got made?', ['Jodorowsky', 'Alejandro Jodorowsky']),
		typed('In Uncut Gems, what is Howard trying to sell?', ['black opal', 'opal', 'opala']),
		closest('In Being John Malkovich, which floor is the office on?', 7.5),
		typed('In The Lobster, which animal does David choose to become?', ['lobster', 'lagosta']),
		typed('What are the giant blue aliens in Fantastic Planet called?', ['Draags', 'Draag', 'Traags', 'Traag']),
	]),
	quiz('music', 'Music', [
		typed('Radiohead: “Karma police, arrest this man…”', ['he talks in maths', 'talks in maths', 'talks in math']),
		typed('Frank Ocean: “I thought that I was dreaming…”', ['when you said you love me', 'you said you love me']),
		typed('MF DOOM: “Just remember ALL CAPS when you spell…”', ['the man name', 'man name', 'the mans name']),
		typed('Talking Heads: “And you may ask yourself…”', ['well how did I get here', 'how did I get here']),
		typed('Pixies: “With your feet in the air and your head on the ground…”', ['try this trick and spin it', 'try this trick']),
		typed('Neutral Milk Hotel: “And one day we will die, and our ashes will fly…”', ['from the aeroplane over the sea', 'aeroplane over the sea', 'airplane over the sea']),
		typed('The Smiths: “And if a double-decker bus crashes into us…”', ['to die by your side', 'die by your side']),
		typed('Bon Iver: “Come on, skinny love, just last the year…”', ['pour a little salt', 'pour a little salt we were never here', 'we were never here']),
		typed('Arctic Monkeys: “I’m going back to 505…”', ['if it’s a seven hour flight', 'seven hour flight', '7 hour flight', 'forty five minute drive', '45 minute drive']),
		choice('Whose album is Loveless?', ['Slowdive', 'Ride', 'My Bloody Valentine', 'Cocteau Twins'], 2),
		typed('Who made Selected Ambient Works 85–92?', ['Aphex Twin', 'Aphex', 'Richard D James']),
		typed('What fruit is on the cover of The Velvet Underground & Nico?', ['banana']),
		typed('What visual album did Frank Ocean put out the day before Blonde?', ['Endless']),
		choice('Which Radiohead album is “Idioteque” on?', ['OK Computer', 'Kid A', 'Amnesiac', 'In Rainbows'], 1),
		typed('What did Björk wear to the 2001 Oscars?', ['swan dress', 'swan', 'a swan', 'cisne']),
		typed('In Aphex Twin’s videos, whose face is on all the kids?', ['his own', 'his own face', 'Aphex Twin', 'Richard D James', 'Richard']),
		typed('Which Tyler, the Creator album has the character in the blond wig?', ['IGOR']),
		typed('Which band is MC Ride the vocalist of?', ['Death Grips']),
	]),
	quiz('games', 'Games', [
		typed('Name both skeleton brothers in Undertale.', ['Sans and Papyrus', 'Papyrus and Sans', 'Sans Papyrus', 'Papyrus Sans']),
		typed('What is the fallen kingdom in Hollow Knight called?', ['Hallownest']),
		closest('How many minutes does the time loop in Outer Wilds last?', 22),
		typed('Which city is Disco Elysium set in?', ['Revachol']),
		typed('What is the name of James’s wife in Silent Hill 2?', ['Mary']),
		typed('Who is the club president in Doki Doki Literature Club?', ['Monika']),
		typed('What is the cat called in OMORI?', ['Mewo']),
		typed('Dark Souls: “Praise the…”', ['sun']),
		typed('In Katamari Damacy, who sends you out to rebuild the stars?', ['King of All Cosmos', 'The King of All Cosmos', 'the King', 'King']),
		closest('How many people were aboard the Obra Dinn?', 60),
		typed('What block do you need to build a Nether portal in Minecraft?', ['obsidian', 'obsidiana']),
		choice('Which of these was NOT in Wii Sports?', ['Tennis', 'Bowling', 'Golf', 'Football'], 3),
		choice('In Pokémon Go, what colour is Team Mystic?', ['Red', 'Blue', 'Yellow'], 1),
		closest('What year did GTA V first come out?', 2013),
		closest('How many pages do you have to collect in Slender?', 8),
		closest('How many nights do you have to survive to beat the first Five Nights at Freddy’s?', 5),
	]),
	quiz('internet', 'Internet nostalgia', [
		typed('Ugandan Knuckles: “Do you know…”', ['the way', 'da wae', 'de wae', 'da way']),
		typed('Musical.ly turned into which app?', ['TikTok']),
		choice('Yanny or…?', ['Yanny', 'Laurel'], 1, 10),
		choice('PewDiePie had a subscriber war with which channel?', ['MrBeast', 'T-Series', 'Cocomelon', 'KSI'], 1),
		typed('Big Chungus is a fat version of which cartoon character?', ['Bugs Bunny', 'Bugs']),
		typed('“It’s Wednesday, my dudes.” Which animal?', ['frog', 'sapo', 'ra']),
		typed('“Damn Daniel, back at it again with the…”', ['white Vans', 'Vans']),
		typed('Which Minecraft YouTuber wore a smiley-face mask?', ['Dream']),
		typed('Which LazyTown song turned into a meme?', ['We Are Number One', 'Number One']),
		typed('Which song plays in the meme where people fly through space?', ['Shooting Stars']),
		choice('Which country are the coffin dance pallbearers from?', ['Nigeria', 'Ghana', 'Kenya', 'Senegal'], 1),
		typed('Bernie: “I am once again asking…”', ['for your financial support', 'financial support']),
		choice('What breed is Doge?', ['Akita', 'Shiba Inu', 'Corgi', 'Pomeranian'], 1),
		typed('Moths love…?', ['lamp', 'lamps', 'lampada', 'candeeiro']),
		typed('In “woman yelling at a cat”, what is on the table in front of the cat?', ['salad', 'a salad', 'vegetables', 'plate of salad', 'salada']),
		typed('What was the creepy WhatsApp “challenge” with the bird-woman face?', ['Momo', 'Momo challenge']),
		typed('What sticky stuff did everyone make at home with glue?', ['slime']),
		typed('Supreme sold a branded what for $30?', ['brick', 'a brick', 'tijolo']),
		typed('In the Kylie Jenner lip challenge, what did people suck on?', ['shot glass', 'glass', 'shot', 'cup', 'bottle', 'copo']),
		typed('In 2019, two million people signed up on Facebook to storm what?', ['Area 51']),
		closest('What year did fidget spinners take over?', 2017),
	]),
];

export const starterQuizzes = (): Quiz[] => structuredClone(STARTER);
