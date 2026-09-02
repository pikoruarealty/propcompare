# V1 amenity catalog proposal — 2026-09-01

**Status:** approved initial seed — extensible through catalog review
**Task:** [Lookup catalog data](../tasklists/2026-09-01-lookup-catalog-data.md)

## What this is

This is the approved initial buyer-facing amenity catalog derived from the structural OCR audit. It contains **26** stable filters, but it is not a numerical limit or a mirror of brochure wording.

This document is the source for idempotently seeding its initial `amenity_catalog` and `amenity_synonyms` rows. New meaningful amenities may be added through the same catalog-review process. It never creates a property-to-amenity relationship; those relationships can only be created through the future reviewed `property_submissions` publish transaction.

## Rules

- A filter indicates that a property explicitly offers the amenity. Missing OCR data never implies that it is unavailable.
- The listed source terms are controlled synonyms, not separate filters.
- Similar but unlisted brochure wording remains review material. It can become a new canonical amenity only through a documented catalog review; it never creates a record automatically.
- Specific sizes, counts, brands, nearby landmarks, room details, and marketing claims are excluded.

## Recommended catalog

| Category       | Key                  | Buyer-facing label   | Approved source synonyms / variants                                                 | State    |
| -------------- | -------------------- | -------------------- | ----------------------------------------------------------------------------------- | -------- |
| Wellness       | `swimming_pool`      | Swimming pool        | Indoor/covered/infinity/splash/kids pool variants                                   | Proposed |
| Wellness       | `gymnasium`          | Gymnasium            | Gym; fully equipped gym                                                             | Proposed |
| Wellness       | `spa`                | Spa                  | Spa area                                                                            | Proposed |
| Wellness       | `sauna`              | Sauna                | —                                                                                   | Proposed |
| Wellness       | `steam_room`         | Steam room           | Steam; steam room                                                                   | Proposed |
| Wellness       | `jacuzzi`            | Jacuzzi              | —                                                                                   | Proposed |
| Wellness       | `yoga_deck`          | Yoga deck            | Yoga area                                                                           | Proposed |
| Wellness       | `salon`              | Salon                | —                                                                                   | Proposed |
| Recreation     | `indoor_games`       | Indoor games         | Indoor games room; game room; game zone; floor games                                | Proposed |
| Recreation     | `home_theatre`       | Home theatre         | Home theater; mini theater; mini theatre; theatre                                   | Proposed |
| Recreation     | `library`            | Library              | —                                                                                   | Proposed |
| Recreation     | `sports_court`       | Sports court         | Multipurpose, badminton, basketball, tennis, squash, and box-cricket court variants | Proposed |
| Social         | `clubhouse`          | Clubhouse            | Club house                                                                          | Approved |
| Social         | `multipurpose_hall`  | Multipurpose hall    | —                                                                                   | Proposed |
| Social         | `banquet_hall`       | Banquet hall         | Banquet                                                                             | Proposed |
| Social         | `lounge`             | Lounge               | Sky lounge                                                                          | Proposed |
| Outdoor/family | `children_play_area` | Children's play area | Kids, toddler, and outdoor play-area variants                                       | Proposed |
| Outdoor/family | `landscaped_garden`  | Landscaped garden    | Landscape garden; central landscape garden                                          | Proposed |
| Outdoor/family | `gazebo`             | Gazebo               | Gazebo seating                                                                      | Proposed |
| Outdoor/family | `lawn`               | Lawn                 | Event lawn                                                                          | Proposed |
| Outdoor/family | `walking_track`      | Walking track        | Walkway; wide walkway; jogging track; trail-pathway variants                        | Proposed |
| Outdoor/family | `pet_park`           | Pet park             | —                                                                                   | Proposed |
| Outdoor/family | `amphitheatre`       | Amphitheatre         | Open amphitheatre stage                                                             | Proposed |
| Access/safety  | `security`           | 24×7 security        | 24×7 security variants                                                              | Approved |
| Access/safety  | `visitor_parking`    | Visitor parking      | Visitor parking spaces                                                              | Approved |
| Access/safety  | `service_lift`       | Service lift         | —                                                                                   | Approved |

## Explicit exclusions

Do not seed generic lift/elevator, foyer, passage, toilet, store room, shower, parking quantity, room count, clear-height claim, car parking allocation, or a developer-branded/marketing phrase as an amenity. A later product decision may define a small, separate specification taxonomy for genuinely comparable construction details.

The complete normalization policy is recorded in [DECISIONS.md](../../DECISIONS.md).
