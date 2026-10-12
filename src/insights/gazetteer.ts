// Small word lists for the cast finder: given names (with gender, so "Mrs. Joe" is not Joe), places,
// nationalities and languages, titles, and nicknames. Hand-kept and deliberately short: they only tip
// a decision the text's own evidence (speech, verbs, titles) already leans toward.

const set = (s: string) => new Set(s.split(/\s+/).filter(Boolean))

export const FEMALE = set(`
Abigail Ada Adela Adele Agnes Alice Alicia Amelia Amy Anna Anne Annie Arabella Augusta Barbara Beatrice Belinda Bella Bertha Beth Betsy Betty
Biddy Blanche Bridget Camilla Caroline Catherine Cecilia Cecily Celia Charlotte Clara Clarissa Constance Cora Cordelia Daisy Diana Dinah Dora
Dorothea Dorothy Edith Eleanor Elinor Eliza Elizabeth Ella Ellen Elsie Emily Emma Esther Estella Eugenia Eva Evelyn Fanny Florence Frances
Georgiana Gertrude Grace Hannah Harriet Helen Helena Henrietta Hester Isabel Isabella Jane Janet Jemima Jenny Jessica Jo Josephine Judith Julia
Juliet Kate Katherine Kitty Laura Lavinia Letitia Lilian Lizzy Lizzie Louisa Louise Lucy Lydia Mabel Madeline Margaret Maria Marianne Marie
Martha Mary Matilda Maud Meg Millicent Miranda Molly Nancy Nell Nelly Olivia Ophelia Pamela Patience Penelope Phoebe Polly Priscilla Rachel
Rebecca Rose Rosalind Rosamond Ruth Sally Sarah Sophia Sophie Susan Susanna Sybil Teresa Ursula Victoria Viola Violet Virginia Winifred
Sonia Sonya Sofya Dounia Dunya Avdotya Katerina Pulcheria Lizaveta Alyona Nastasya Polenka Marfa Praskovya Amalia Natalya Darya Lida Lena
Natasha Anna Masha Marya Varvara Tatyana Olga Agafya Aglaya Nastenka Dounechka Glinda Em Wendy Heidi Dorothée Héloïse Mercedes Fantine Cosette`)

export const MALE = set(`
Aaron Abel Abraham Adam Albert Alexander Alfred Allan Ambrose Andrew Anthony Archibald Arthur Augustus Barnaby Bartholomew Basil Ben Benjamin
Bernard Bertie Bill Bob Charles Charlie Christopher Clarence Cuthbert Daniel David Denny Dick Donald Douglas Edgar Edmund Edward Edwin Ernest
Felix Ferdinand Francis Frank Fred Frederick Gabriel George Gilbert Godfrey Harold Harry Henry Herbert Horace Hugh Humphrey Isaac Jack Jacob
James Jasper Jeremiah Jim Joe John Jonathan Joseph Joshua Julian Kit Lawrence Leonard Lewis Lionel Luke Mark Martin Matthew Michael Nathaniel
Ned Nicholas Noah Oliver Oscar Patrick Paul Percy Peter Philip Pip Ralph Raymond Reuben Richard Robert Roger Samuel Sebastian Simon Stephen
Thomas Timothy Toby Tom Walter Wilfred William Willy Ishmael Ahab Elijah Jonah Peleg Bildad Starbuck Stubb Flask Queequeg Tashtego Daggoo
Rodion Rodya Dmitri Mitka Porfiry Arkady Pyotr Semyon Andrey Ilya Nikolay Nikodim Mikolka Kolya Alexandr Ivan Fyodor Alexey Alyosha Sergey
Mikhail Pavel Vasily Yakov Afanasy Prokofy Stepan Boris Grigory Konstantin Lev Leo Nikita Toto Boq Henry Huck Huckleberry Tom Jim Holmes
Sherlock Watson Edmond Jean Marius Javert Pierre Andrei Heathcliff Hareton Linton Rochester Darcy Bingley Wickham Collins`)

/** Short forms → the full name they stand for (English and the Russian diminutives of classic translations). */
export const NICK: Record<string, string> = Object.fromEntries(`
Lizzy:Elizabeth Lizzie:Elizabeth Eliza:Elizabeth Liz:Elizabeth Beth:Elizabeth Betsy:Elizabeth Bess:Elizabeth Kitty:Catherine Kate:Catherine
Katie:Catherine Meg:Margaret Maggie:Margaret Peggy:Margaret Polly:Mary Molly:Mary Nell:Ellen Nelly:Ellen Fanny:Frances Jenny:Jane
Sally:Sarah Sukey:Susan Patty:Martha Jack:John Johnny:John Bill:William Billy:William Will:William Willy:William Bob:Robert Bobby:Robert
Dick:Richard Tom:Thomas Tommy:Thomas Ned:Edward Ted:Edward Teddy:Edward Harry:Henry Hal:Henry Jim:James Jem:James Jemmy:James
Joe:Joseph Charlie:Charles Fred:Frederick Freddy:Frederick Sam:Samuel Ben:Benjamin Nick:Nicholas Tony:Anthony Kit:Christopher
Rodya:Rodion Dounia:Avdotya Dunya:Avdotya Dounechka:Avdotya Sonia:Sofya Sonya:Sofya Polenka:Polina Polya:Polina Nastenka:Nastasya
Kolya:Nikolay Mikolka:Nikolay Mitka:Dmitri Mitya:Dmitri Pasha:Praskovya Pashenka:Praskovya Lida:Lidia Alyosha:Alexey Masha:Marya
Natasha:Natalya Sasha:Alexandr Petya:Pyotr Vanya:Ivan Fedya:Fyodor Grisha:Grigory Kostya:Konstantin Lyova:Lev Seryozha:Sergey`
  .trim().split(/\s+/).map(p => p.split(':')))

/** Titles, with the gender they give the name after them ('' = either). "Mrs. Bennet" and "Mr. Bennet" stay two people. */
export const TITLES = new Map<string, '' | 'm' | 'f'>(`
Mr:m Mister:m Sir:m Lord:m Master:m Monsieur:m Herr:m Signor:m Senor:m Señor:m Don:m Father:m Brother:m Uncle:m King:m Prince:m Duke:m
Count:m Baron:m Earl:m Mrs:f Missus:f Miss:f Ms:f Madam:f Madame:f Mme:f Mademoiselle:f Mlle:f Lady:f Dame:f Frau:f Fräulein:f Signora:f
Senora:f Señora:f Dona:f Doña:f Mother:f Sister:f Aunt:f Queen:f Princess:f Duchess:f Countess:f Baroness:f Mistress:f Dr: Doctor:
Captain: Capt: Colonel: Col: General: Gen: Major: Lieutenant: Lt: Sergeant: Sgt: Corporal: Admiral: Commodore: Mate: Professor: Prof:
Reverend: Rev: Judge: Saint: St: Cousin: Old: Little: Young: Mynheer: Messrs:`
  .trim().split(/\s+/).map(p => { const [t, g] = p.split(':'); return [t, (g ?? '') as '' | 'm' | 'f'] }))

/** Nationalities, peoples, languages and faiths: capitalised, never characters. */
export const DEMONYMS = set(`
English Englishman Englishmen Englishwoman French Frenchman Frenchmen Dutch Dutchman German Germans Spanish Spaniard Spaniards Italian
Italians Russian Russians Polish Pole Poles Irish Irishman Scotch Scottish Scot Scots Welsh Welshman British Briton American Americans
Yankee Yankees Indian Indians Chinese Japanese Turkish Turk Turks Greek Greeks Roman Romans Latin Hebrew Jew Jews Jewish Arab Arabs Arabic
Persian Persians Egyptian Egyptians African Africans European Europeans Asiatic Asian Portuguese Swedish Swede Danish Dane Danes Norwegian
Norse Christian Christians Christianity Catholic Catholics Protestant Quaker Quakers Pagan Pagans Moslem Mahometan Mohammedan Hindoo Hindu
Parisian Londoner Nantucketer Nantucketers Islander Islanders Gentile Gentiles Negro Swiss Austrian Prussian Hungarian Bohemian Cossack
Tartar Tatar Malay Malays Polynesian Mexican Peruvian Canadian Gaelic Saxon Saxons Norman Normans Celtic Puritan Puritans Methodist Methodists
Munchkins Winkies Quadlings Lilliputians`)

/** Places that turn up across classic fiction (countries, capitals, regions, seas, rivers). */
export const PLACES = set(`
England Scotland Ireland Wales Britain France Paris Germany Berlin Italy Rome Venice Florence Naples Milan Spain Madrid Portugal Lisbon
Russia Moscow Petersburg Siberia Poland Holland Amsterdam Belgium Brussels Switzerland Geneva Austria Vienna Greece Athens Turkey
Constantinople Egypt Cairo Africa Europe Asia America Canada Mexico Peru Brazil India China Japan Persia Arabia Jerusalem Babylon Nineveh
London Bath Brighton Oxford Cambridge Liverpool Manchester Bristol Dover Edinburgh Glasgow Dublin York Kent Surrey Sussex Essex Devon
Cornwall Norfolk Suffolk Derbyshire Hertfordshire Yorkshire Lancashire Hampshire Berkshire Wiltshire Somerset Dorset Gloucestershire
Boston Philadelphia Washington Virginia Carolina Georgia Kansas Omaha Chicago California Texas Ohio Nantucket Bedford Massachusetts
Atlantic Pacific Mediterranean Thames Neva Nile Rhine Danube Ganges Hudson Mississippi Greenland Iceland Norway Sweden Denmark Lapland
Sumatra Java Borneo Ceylon Madagascar Patagonia Antarctic Arctic Spitzbergen`)
