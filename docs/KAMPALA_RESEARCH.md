# Kampala research notes (for the game map)

What was researched and how it shaped the game city. The game keeps a street grid (needed for the traffic AI
and the road-rule checks), so this is a **scaled, recognisable Kampala**, not a survey-accurate map.

## Facts used

| Topic | What the sources say | In the game |
|---|---|---|
| Kampala Road × Entebbe Road | Entebbe Road starts on Kampala Road (opposite Housing Finance Bank's Kampala Road branch) and runs south through the Clock Tower area to the airport (~40 km). | The centre junction (spawn) is Kampala Rd × Entebbe Rd; Entebbe Rd runs south. |
| Kampala Road length | A KCCA plan lists Kampala Road between Kyagwe Road and Johnstone Street at about 1.8 km. | Main E–W road through the middle of a ~645 m city (scaled ~1:3). |
| Clock Tower ("Saawa ya Queen") | Raised in the 1950s at the Nsambya–Entebbe road junction to mark Queen Elizabeth II's first visit (1954). Dismantled for the Kampala Flyover Project and rebuilt nearby. | Roundabout on Entebbe Rd at Queensway with a cream clock tower and four clock faces. |
| Other junctions | The flyover project covers Clock Tower and Kitgum House; KCCA black-spot list includes Bwaise, Kalerwe and Busega roundabouts; Bombo Road / Wandegeya is where the Kampala–Bombo Expressway starts. | Roundabouts at Clock Tower, Jinja Rd (Kitgum House), Wandegeya, Kubiri, Kamwokya and Kibuye. |
| Seven hills | Lists differ; commonly Kololo/Nakasero, Kibuli, Rubaga, Old Kampala, Namirembe/Mengo, Makerere, Mulago, Nsambya. Namirembe has the Anglican cathedral, Rubaga the Catholic cathedral, Kibuli a mosque, Mengo the Kabaka's palace, Kololo/Nakasero government. | Hills on the horizon with their landmarks (see `HILLS` in `src/game/kampalaMap.ts`). |
| Gaddafi National Mosque | On Old Kampala Hill; minaret ~72 m (272 steps); completed 2006; capacity ~25,000. | White mosque with dome and tall minaret on the north-west hill. |
| Rubaga Cathedral | St Mary's, headquarters of the Catholic Church in Uganda, hilltop. | Brick-red church with twin towers on the west hill. |
| Bahá'í House of Worship | Kampala has one of the few Bahá'í Houses of Worship in the world (location detail not confirmed by these sources). | Green dome on the northern horizon. |
| Independence Monument | Speke Road near the Sheraton; figure breaking free of its wrappings and raising a child (sculptor Gregory Maloba is usually credited). | Bronze figure on a tall plinth in a paved park on Speke Rd by Kampala Rd. |
| Old Taxi Park | Central transport hub; thousands of matatus crammed into a small space. | Block packed with white matatus, a shelter and waiting passengers. |
| Nakasero Market | Established 1895, moved to its city-centre site in 1905; fresh produce; a short walk from the Independence Monument. | Market block of stalls, iron roofs, umbrellas and produce, next to the monument park. |
| Owino (St Balikuddembe) Market | Large, crowded market south of the taxi parks, known for second-hand clothes ("mivumba") under tarps and umbrellas. | Block of tight tarp-roofed stalls with clothes heaps and shoppers. |
| Makerere University | Founded 1922 on Makerere Hill; the white Main Building with its clock tower is the best-known image; main gate on University Rd near Wandegeya. | Gate with a name board and a white Main Building with clock tower, near Wandegeya roundabout. |
| Mulago Hospital | Uganda's national referral hospital on Mulago Hill, north of the centre. | Tall white ward block with a red cross, gate and waiting relatives. |
| Boda stages | Riders wait at named stages, often with a simple shelter and a painted board. | Shelters with tin roofs, benches and yellow stage boards at busy corners. |
| Kampala Road buildings | Colonial-era and early modernist buildings (Patel Press 1924, Bank of Uganda complex, Amber House 1953), many being replaced by malls and towers. | Shop rows with plaster, signboards and verandahs; mid-rise towers; existing photo-textured landmarks (Mapeera, Stanbic, NSSF). |

## Roads

| Kampala road | Game road type |
|---|---|
| Kampala Road, Jinja Road | Dual carriageway with kerbed median |
| Entebbe Road, Bombo Road, Queensway, Yusuf Lule Road, Kira Road, Lugogo By-pass | Main road, two lanes each way |
| Luwum St, Speke Rd, Parliament Ave, Namirembe Rd and other city streets | Side street, one lane each way |
| Outskirts (Masaka Rd end, Port Bell Rd end, Kibuye, Ntinda edges) | Murram (unpaved laterite) |

Open drains, red murram verges, faded markings and patched potholes reflect common Kampala street conditions.

## Scale and liberties

- Real distances are compressed about 3:1 so a shift takes minutes, not hours.
- Roads follow a grid (with four road types); real Kampala also has winding hill roads.
- Hills are a backdrop (the city itself is flat), so slopes don't affect riding.
- Fares, fines and jail terms remain game values.

## Sources

- [Kampala Flyover Road Project (Wikipedia)](https://en.wikipedia.org/wiki/Kampala_Flyover_Road_Project)
- [Kampala–Entebbe Road (Wikipedia)](https://en.wikipedia.org/wiki/Kampala%E2%80%93Entebbe_Road)
- [Kampala–Bombo Expressway (Wikipedia)](https://en.wikipedia.org/wiki/Kampala%E2%80%93Bombo_Expressway)
- [How to safely navigate busy intersections (Monitor)](https://www.monitor.co.ug/uganda/business/auto/how-to-safely-navigate-busy-intersections-5597698)
- [KCCA planned road reconstruction in Central Division (PDF)](https://www.kcca.go.ug/uDocs/PLANNED%20ROAD%20RECONSTRUCTION%20IN%20CENTRAL%20DIVISION.pdf)
- [Where is the monumental Queen's clock? (Monitor)](https://www.monitor.co.ug/uganda/news/national/where-is-the-monumental-queen-s-clock--3782184)
- [Saawa ya Queen restored without original clock (Observer)](https://observer.ug/news/saawa-ya-queen-restored-without-original-clock/)
- [Kampala city tour guide (Vibrant Holiday Safaris)](https://vibrantholidaysafaris.com/a-local-guide-to-a-kampala-city-tour/)
- [Things to do and see in Kampala (African Pearl Safaris)](https://www.africanpearlsafaris.com/things-to-do-and-see-in-kampala)
- [Kampala: city of seven hills (People Daily)](https://peopledaily.digital/lifestyle/kampala-beautiful-forested-hills-city-of-seven-hills)
- [Kampala (New World Encyclopedia)](https://www.newworldencyclopedia.org/entry/kampala)
- [Kampala Road's historic buildings (Monitor)](https://www.monitor.co.ug/uganda/magazines/life/kampala-road-s-historic-buildings-1560526)
- [How Kampala was designed by colonialists (Monitor)](https://www.monitor.co.ug/uganda/magazines/people-power/how-kampala-was-designed-by-colonialists-1547454)

No photos were copied into the game: they were used only as visual reference, because their copyright belongs
to the photographers. Everything in the city is modelled in code.
