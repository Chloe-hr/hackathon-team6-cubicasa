# User stories (Team 6)

> ✏️ Draft written with AI help. Team 6: check them, change the words you'd say differently, and put them on Miro.

**1. Find precedents.**
As an **architect starting a housing project**, I want to **upload a floor plan and see the five most similar real homes**, so that **I find precedents in seconds instead of searching archives by hand**.

- Done when: I upload a PNG or JPEG plan and see my plan, the rooms the model sees in it and five similar plans with their rooms, in under a minute even if the model server was asleep.
- Sequence diagram: `sequence_1_search.png`.

**2. Come back to my searches.**
As an **architect coming back to a project**, I want to **see my past searches and open one again**, so that **I can compare the same precedents later without uploading the plan again**.

- Done when: the page lists my past searches (plan, date, best match) after a reload, and "Open" shows the five matches again without calling the model.
- Sequence diagram: `sequence_2_history.png`.
