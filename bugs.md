# 🛠️ CityRPG Development Tracker

---

## 🔴 High Priority (Bugs & Critical Fixes)
> *Bugs that break gameplay or prevent login.*

* **[BUG-000] **
    * **Issue:**
    * **Steps:**
    * **Status:**

---

## 🟡 Medium Priority (Visual & Logic)
> *Bugs related to UI, animations, or minor gameplay glitches.*

---

## 🟢 Low Priority (Polish & Ideas)
> *Small tweaks or "nice-to-have" features.*

* **[BUG-000] **
    * **Issue:**
    * **Status:**

---

## ✅ Completed & Fixed
> *Move items here once Claude confirms they are resolved.*

* **[BUG-002] Hair on characters don't look right when walking left and right**
    * **Issue:** Hair didn't cover the complete top of the head above the eyes when facing left/right
    * **Fix:** Extended hair rect width for direction 1 (left) from 16→19px and direction 2 (right) from 16→19px (starting 2px further left), covering the full head circle edge. Regenerated all 5 sprite layer sheets.
    * **Status:** Fixed

* **[BUG-003] Hair in the create character screen goes below the eyes**
    * **Issue:** Hair rect extended below the head center (y=24–31), overlapping the eye/forehead area. Eyes were also placed inside the hair zone (y=22).
    * **Fix:** Removed the hair fillRect below the head center so only the top-half arc is drawn. Moved eyes from H-98→H-92 (y=28) to place them in the face area below the hairline. Adjusted female side curtains accordingly.
    * **Status:** Fixed

* **[BUG-004] HUD has 3 lines of info but its jumbled**
    * **Issue:** HP, energy, and money stat rows were on top of each other, hard to read.
    * **Fix:** `#game-container` has `line-height: 0` (prevents gap under the canvas). This inherited into `#hud`, collapsing all text row heights to zero. Added `line-height: normal` to `#hud` to reset it.
    * **Status:** Fixed
