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
| Kisekka Market | Uganda's main auto parts centre, downtown on the Nakivubo Road side towards Old Kampala; traders were moved there by the city council in the early 1990s. A 2010 fire gutted over 500 stalls, and redevelopment has been contested. | Arcades of lock-up shops around a yard of tyres, exhaust tables and bodas under repair, on Nakivubo Rd. |
| Nakivubo Channel | Kampala's main storm drain, taking run-off from the central area, including Nakasero and Owino Market. Plans to line and deck it over are disputed and blamed for flooding, so its current state varies by section. | Open walled channel just south of Owino, passing under the cross roads in culverts: the channel as riders have long known it. |
| Clock Tower flyover | Phase 1 of the Kampala Flyover Project, commissioned March 2025: a 584 m flyover at Clock Tower and a Nsambya underpass. The Kitgum House flyover is a later phase; no source confirmed it is built. | About 93 m elevated road crossing Queensway beside the Clock Tower roundabout, not rideable. No Kitgum House flyover or underpass. The tower stays on its island; in reality it was rebuilt nearby. |
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
- Hills are a backdrop (the city itself is flat), so slopes don't affect riding. Their winding roads are scenery;
  their paths and surfaces are invented, not traced from real roads.
- Flyover ramps are steeper than the real thing (about 15°) because distances are compressed.
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
- [Kisekka Market to get new look (Monitor)](https://www.monitor.co.ug/uganda/business/commodities/kisekka-market-to-get-new-look-1563572)
- [Traders build shopping mall as Kisekka Market rises from rubble (Monitor)](https://www.monitor.co.ug/uganda/news/national/traders-build-shopping-mall-as-kisekka-market-rises-from-rubble-1762272)
- [Fire guts Kisekka Market (New Vision)](https://www.newvision.co.ug/news/1283771/guts-kisekka-market)
- [Nakivubo Channel (Wikipedia)](https://en.wikipedia.org/wiki/Nakivubo_Channel)
- [KCCA blames downtown flooding on Nakivubo Channel works (Observer)](https://observer.ug/news/kcca-blames-downtown-flooding-on-nakivubo-channel-works/)
- [Museveni commissions Kampala Flyover Project (Ministry of ICT)](https://ict.go.ug/media/news/president-museveni-commissions-kampala-flyover-project)

No photos were copied into the game: they were used only as visual reference, because their copyright belongs
to the photographers. Everything in the city is modelled in code.
