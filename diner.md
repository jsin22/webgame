# The Greasy Spoon 2.0: NY Diner Simulator

"The Greasy Spoon" is a deep dual-mode simulator within City RPG, reflecting the grit and hustle of a New York City diner.

## Overview
The game features two distinct modes: **Customer Mode** for stat recovery and NY staples, and **Manager Mode** for complex supply chain management and profit generation.

---

## 📜 Customer Mode (NY Diner Menu)
Accessible at any time, this mode uses a "Greasy Paper" UI style and offers specific strategic benefits.

### Menu & Stat Recovery
| Item | Category | Stat Recovery |
| :--- | :--- | :--- |
| **"Bottomless" Coffee** | Beverage | +5 HP, +30 Energy |
| **The "Standard"** | Breakfast | +45 HP, +15 Energy |
| **Matzo Ball Soup** | Soup | +30 HP, +5 Energy |
| **Classic NY Burger** | Lunch | +40 HP, +10 Energy |
| **Grilled Chicken** | Lunch | +35 HP, +20 Energy |
| **Blueberry Muffin** | Bakery | +10 HP, +15 Energy |
| **NY Cheesecake** | Dessert | +15 HP, +25 Energy |

### Reputation & Reviews
Patrons can rate their experience (1–5 stars). Reviews influence **Global Reputation**, driving foot traffic for Manager Mode.

---

## 📋 Manager Mode (NY Hustle)
Accessible **6:00 AM – 10:00 PM**.

### 1. Ingredient Groups
Instead of individual items, inventory is managed in four strategic groups:
- **Proteins**: Used for Burgers, Bacon, Eggs, and Chicken.
- **Grains**: Used for Buns, Rye Bread, and Muffins.
- **Produce/Dairy**: Used for Soup, Burger toppings, and Cheesecake.
- **Coffee Grounds**: Used for the Coffee Urn.

### 2. The Prep Mechanic
Certain items must be prepped in batches at the start of a shift:
- **Soup Stock**: Requires 10 Produce and 5 Protein. Yields 20 servings. Spoils at the end of every day.
- **Bakery Case**: Requires 10 Grains and 5 Produce. Yields 20 servings (Muffins/Cheesecake).

### 3. Equipment Maintenance
Three critical machines require upkeep:
- **The Grill**: Used for Lunch/Protein. If condition < 50%, demand drops 30%.
- **The Toaster**: Used for Breakfast. If condition < 20%, Breakfast items are unavailable.
- **Coffee Urn**: If condition < 10%, Coffee is unavailable (major walk-outs).
- **Repair**: A flat $50 "Repair All" fee at the Market restores all machines to 100%.

### 4. NY Rush Events
Daily events shift the city's vibe:
- **Sunday Brunch Rush**: 2x Demand, 2x Grill decay.
- **Construction Site**: +50% demand for Burgers and Coffee.
- **Health Inspector**: If Grill < 40%, pay a $200 fine and lose 1.0 Reputation.

### 5. Shift Simulation & Rush Meter
Running a shift simulates 14 hours of NYC chaos:
- **Rush Meter**: A visual bar in the shift report showing Customer Satisfaction.
- **Financial Breakdown**: Detailed tracking of Gross Revenue, Spoilage, Fines, and Net Profit.
- **City Buzz**: A log of customer reactions and local neighborhood news.

---

## 📈 Reputation System
- **Scale**: 1.0★ to 5.0★.
- **Drivers**: Satisfaction, Generosity settings, and Health Inspection outcomes.
- **Impact**: Scales base traffic from 0 to 50+ customers per shift.

---

## 🛠 Technical Implementation
- **State**: Managed in the `_DS` closure within `js/scenes/DinerScene.js`.
- **Stat Hooks**: Integrates with `GameState` for wallet, HP, and Energy updates.
- **Advanced Logic**: Includes equipment-specific demand penalties and complex ingredient mapping for Prep items.
