# Rides Feature Design

Commuter ride-sharing within the Barter app. Drivers post recurring ride offers, riders browse and coordinate via chat.

## Problem

Quadra Island residents commute via ferry on predictable schedules. Someone on the ferry might need a ride to Bold Point, or a Bold Point resident might offer daily rides to the ferry. Currently no way to coordinate this in the app.

## Solution

Add "Rides" as a listing category with ride-specific fields. Drivers post standing offers (route, schedule, seats). Riders browse, filter by route, and message drivers to coordinate. No booking system — chat handles coordination.

## Data Model

New nullable columns on `listings` table (only used when category = "rides"):

| Column | Type | Constraints |
|--------|------|-------------|
| `route_from` | text | FK to areas.slug, nullable |
| `route_to` | text | FK to areas.slug, nullable |
| `schedule` | text | nullable |
| `seats` | smallint | nullable, check 1-6 |
| `gas_share` | boolean | default false |

Add "Rides" to categories table:
```sql
INSERT INTO categories (slug, name, icon, sort_order)
VALUES ('rides', 'Rides', '🚗', 85);
```

### Validation Rules

When category is "rides":
- `route_from` required
- `route_to` required
- `schedule` required
- `seats` required (1-6)

When category is not "rides":
- These fields ignored/nullable

## UI: Create Ride Listing

When user selects "Rides" category, form shows additional fields:

**Standard fields:**
- Title (auto-suggested based on route)
- Description
- Photos (optional)
- Looking for (existing field — use for barter preferences)

**Ride-specific fields (conditional):**
- From: dropdown of areas
- To: dropdown of areas  
- Schedule: text input, placeholder "Mon-Fri 7am out, 4pm return"
- Seats available: number input (1-6)
- Gas share welcome: checkbox

**Example guidance above form:**
> "Example: I drive from Bold Point to the ferry Mon-Fri at 7am, returning at 4pm. 3 seats available. Gas share appreciated or happy to barter."

## UI: Browse & Display Rides

**Feed filtering:**
- "Rides" appears in category dropdown
- Route filter: "From: [area]" and "To: [area]" dropdowns (optional)

**Ride card in feed:**
```
🚗 Ride: Bold Point ↔ Ferry
   Bold Point → Quathiaski Cove
   Mon-Fri 7am, return 4pm | 3 seats
   Gas share or barter
   — posted by Maria
```

**Ride detail page:**
- Standard listing layout
- Structured ride info section: route, schedule, seats, gas preference
- "Message" button opens chat with driver

## Rider → Driver Flow

1. Rider browses "Rides" category or filters by route
2. Opens ride detail page
3. Clicks "Message" — chat opens with listing context
4. Coordinates via chat: days needed, pickup location, barter/gas arrangement

**Chat prompt for ride listings:**
> "Tip: Let the driver know which days you need, where to meet, and what you can offer in return."

## Scope Boundaries

**In scope:**
- Ride listing category with structured fields
- Conditional form fields when category is "rides"
- Route filtering in feed
- Ride-specific display in cards and detail page
- Chat prompt for ride context

**Out of scope (future):**
- Seat booking/reservation system
- Real-time availability tracking
- Push notifications for matching
- Recurring ride schedules (calendar integration)
- Other urgent needs beyond rides

## Ferry Terminal Note

Quathiaski Cove is where the Quadra ferry docks. No need for a separate "Ferry Terminal" area — use existing Quathiaski Cove area.
