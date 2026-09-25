import { db, dbClient } from "@/db";
import { sql } from "drizzle-orm";
import {
  amenityCatalog,
  amenitySynonyms,
  bhkTypes,
  layoutTypes,
  propertySchemaFields,
  propertyTypes,
  specificationCatalog,
  specificationSynonyms,
} from "@/db/schema/catalog";

const corePropertyTypes = [
  { key: "apartment", label: "Apartment" },
  { key: "bungalow", label: "Bungalow" },
  { key: "plot", label: "Plot" },
];

const coreBhkTypes = [
  { key: "studio", label: "Studio", bedroomCount: null },
  { key: "1bhk", label: "1 BHK", bedroomCount: 1 },
  { key: "2bhk", label: "2 BHK", bedroomCount: 2 },
  { key: "3bhk", label: "3 BHK", bedroomCount: 3 },
  { key: "4bhk", label: "4 BHK", bedroomCount: 4 },
  { key: "5bhk_plus", label: "5 BHK", bedroomCount: 5 },
];

const coreLayoutTypes = [
  { key: "simplex", label: "Simplex" },
  { key: "duplex", label: "Duplex" },
  { key: "penthouse", label: "Penthouse" },
];

/** Contract fields switched off because the regulator now states the fact as a
 * number (`DECISIONS.md` 2026-09-24, "RERA second pass, as built"): open area,
 * and density from land area and units; and (2026-09-25) lifts per block and
 * covered parking. Deactivated, never deleted. */
const RETIRED_FIELD_KEYS = new Set([
  "property.specifications.open_space",
  "property.specifications.density_units_per_acre",
  "property.specifications.lifts_per_tower",
  "property.specifications.parking_levels",
]);

const initialAmenityCatalog = [
  {
    key: "swimming_pool",
    label: "Swimming pool",
    category: "Wellness",
    synonyms: [
      "indoor pool",
      "covered pool",
      "infinity pool",
      "splash pool",
      "kids pool",
      "kids' pool",
    ],
  },
  {
    key: "gymnasium",
    label: "Gymnasium",
    category: "Wellness",
    synonyms: ["gym", "fully equipped gym", "fully-equipped gym"],
  },
  { key: "spa", label: "Spa", category: "Wellness", synonyms: ["spa area"] },
  { key: "sauna", label: "Sauna", category: "Wellness", synonyms: [] },
  {
    key: "steam_room",
    label: "Steam room",
    category: "Wellness",
    synonyms: ["steam"],
  },
  {
    key: "jacuzzi",
    label: "Jacuzzi",
    category: "Wellness",
    synonyms: [],
  },
  {
    key: "yoga_deck",
    label: "Yoga deck",
    category: "Wellness",
    synonyms: ["yoga area"],
  },
  { key: "salon", label: "Salon", category: "Wellness", synonyms: [] },
  {
    key: "indoor_games",
    label: "Indoor games",
    category: "Recreation",
    synonyms: [
      "indoor games room",
      "game room",
      "games room",
      "game zone",
      "floor games",
    ],
  },
  {
    key: "home_theatre",
    label: "Home theatre",
    category: "Recreation",
    synonyms: ["home theater", "mini theater", "mini theatre", "theatre"],
  },
  { key: "library", label: "Library", category: "Recreation", synonyms: [] },
  {
    key: "sports_court",
    label: "Sports court",
    category: "Recreation",
    synonyms: [
      "multipurpose court",
      "multi-purpose court",
      "badminton court",
      "basketball court",
      "tennis court",
      "squash court",
      "box cricket court",
      "box-cricket court",
    ],
  },
  {
    key: "clubhouse",
    label: "Clubhouse",
    category: "Social",
    synonyms: ["club house"],
  },
  {
    key: "multipurpose_hall",
    label: "Multipurpose hall",
    category: "Social",
    synonyms: [],
  },
  {
    key: "banquet_hall",
    label: "Banquet hall",
    category: "Social",
    synonyms: ["banquet"],
  },
  {
    key: "lounge",
    label: "Lounge",
    category: "Social",
    synonyms: ["sky lounge"],
  },
  {
    key: "children_play_area",
    label: "Children's play area",
    category: "Outdoor/family",
    synonyms: [
      "kids play area",
      "kids' play area",
      "kids play zone",
      "toddler play area",
      "toddler's play area",
      "outdoor play area",
    ],
  },
  {
    key: "landscaped_garden",
    label: "Landscaped garden",
    category: "Outdoor/family",
    synonyms: ["landscape garden", "central landscape garden"],
  },
  {
    key: "gazebo",
    label: "Gazebo",
    category: "Outdoor/family",
    synonyms: ["gazebo seating"],
  },
  {
    key: "lawn",
    label: "Lawn",
    category: "Outdoor/family",
    synonyms: ["event lawn"],
  },
  {
    key: "walking_track",
    label: "Walking track",
    category: "Outdoor/family",
    synonyms: ["walkway", "wide walkway", "jogging track", "trail pathway"],
  },
  {
    key: "pet_park",
    label: "Pet park",
    category: "Outdoor/family",
    synonyms: [],
  },
  {
    key: "amphitheatre",
    label: "Amphitheatre",
    category: "Outdoor/family",
    synonyms: ["open amphitheatre stage"],
  },
  {
    key: "security",
    label: "24×7 security",
    category: "Access/safety",
    synonyms: ["24x7 security", "24/7 security", "24 x 7 security"],
  },
  {
    key: "visitor_parking",
    label: "Visitor parking",
    category: "Access/safety",
    synonyms: ["visitor parking spaces"],
  },
  {
    key: "ev_charging",
    label: "EV charging",
    category: "Access/safety",
    synonyms: [
      "ev car charging",
      "ev car charging provision",
      "ev charging point",
      "ev charging station",
      "electric vehicle charging",
      "car charging point",
    ],
  },
  {
    key: "service_lift",
    label: "Service lift",
    category: "Access/safety",
    synonyms: [],
  },
];

const initialSpecificationCatalog = [
  {
    key: "construction_quality",
    label: "Construction quality",
    category: "Finish quality",
    synonyms: ["construction_quality"],
  },
  {
    key: "flooring",
    label: "Flooring",
    category: "Finish quality",
    synonyms: ["flooring"],
  },
  {
    key: "sanitary_fittings",
    label: "Bath & sanitary fittings",
    category: "Finish quality",
    synonyms: ["bath_sanitary_fittings"],
  },
  {
    key: "window_glazing",
    label: "Window glazing",
    category: "Finish quality",
    synonyms: ["window_glasses"],
  },
  {
    key: "ceiling_height",
    label: "Ceiling height",
    category: "Design & space",
    synonyms: ["internal_ceiling_height"],
  },
  {
    key: "open_space",
    label: "Open space",
    category: "Design & space",
    synonyms: ["open_space"],
  },
  {
    key: "podium_structure",
    label: "Podium structure",
    category: "Design & space",
    synonyms: ["podium_structure"],
  },
  {
    key: "clubhouse_size",
    label: "Clubhouse size",
    category: "Design & space",
    synonyms: ["clubhouse_size"],
  },
  {
    key: "lifts_per_tower",
    label: "Lifts per tower",
    category: "Building operation",
    synonyms: ["lifts_per_tower"],
  },
  {
    key: "parking_levels",
    label: "Parking levels",
    category: "Building operation",
    synonyms: ["parking_levels"],
  },
  {
    key: "density_units_per_acre",
    label: "Units per acre",
    category: "Building operation",
    synonyms: ["density_units_per_acre"],
  },
  {
    key: "geyser_heat_pump",
    label: "Geyser / heat pump",
    category: "Mechanical systems",
    synonyms: ["geyser_heat_pump"],
  },
  {
    key: "vrv_ac_provided",
    label: "VRV air conditioning",
    category: "Mechanical systems",
    synonyms: ["vrv_ac_provided"],
  },
  // Added schema v12 (docs/schema/schema.v12.md): every one of these is a
  // fact Claude Sonnet already read correctly on a real brochure (Godrej
  // Altus flipchart, 2026-09-23) and had nowhere to put, so it fell into
  // unmappedRawEvidence, which nothing downstream persists. Giving each its
  // own catalog key is what makes it a real field instead of a discarded one.
  {
    key: "windows",
    label: "Windows",
    category: "Finish quality",
    synonyms: ["windows"],
  },
  {
    key: "doors",
    label: "Doors",
    category: "Finish quality",
    synonyms: ["doors"],
  },
  {
    key: "toilet_flooring_dado",
    label: "Toilet flooring & dado",
    category: "Finish quality",
    synonyms: ["toilet_flooring_dado"],
  },
  {
    key: "wall_finishing",
    label: "Wall finishing",
    category: "Finish quality",
    synonyms: ["wall_finishing"],
  },
  {
    key: "kitchen_finishes",
    label: "Kitchen finishes",
    category: "Finish quality",
    synonyms: ["kitchen"],
  },
  {
    key: "material_tolerances",
    label: "Material tolerances",
    category: "Finish quality",
    synonyms: ["material_tolerances"],
  },
  {
    key: "electricals",
    label: "Electricals",
    category: "Mechanical systems",
    synonyms: ["electricals"],
  },
  {
    key: "power_backup",
    label: "Power backup",
    category: "Mechanical systems",
    synonyms: ["power_backup"],
  },
  {
    key: "waterproofing",
    label: "Waterproofing",
    category: "Building operation",
    synonyms: ["waterproofing"],
  },
  {
    key: "drainage",
    label: "Drainage",
    category: "Building operation",
    synonyms: ["drainage"],
  },
  {
    key: "damp_proofing",
    label: "Damp proofing",
    category: "Building operation",
    synonyms: ["damp_proofing"],
  },
  {
    key: "safety_features",
    label: "Safety features",
    category: "Building operation",
    synonyms: ["safety_features"],
  },
  {
    key: "special_features",
    label: "Special features",
    category: "Design & space",
    synonyms: ["special_features"],
  },
  {
    key: "courtyard_area",
    label: "Courtyard area",
    category: "Design & space",
    synonyms: ["courtyard_area"],
  },
  {
    key: "vastu_compliance",
    label: "Vastu compliance",
    category: "Certifications & compliance",
    synonyms: ["vastu_compliance", "vastu_compliance_declaration"],
  },
  {
    key: "plot_no",
    label: "Plot number",
    category: "Location & legal",
    synonyms: ["plot_no"],
  },
  {
    key: "nearby_connectivity",
    label: "Nearby connectivity",
    category: "Location & legal",
    synonyms: ["nearby_connectivity", "connectivity_nearby_landmarks"],
  },
  {
    key: "nearby_hospitals",
    label: "Nearby hospitals",
    category: "Location & legal",
    synonyms: ["nearby_hospitals"],
  },
  {
    key: "nearby_schools",
    label: "Nearby schools & institutions",
    category: "Location & legal",
    synonyms: ["nearby_schools", "nearby_educational_institutions"],
  },
  {
    key: "amenities_full_list",
    label: "Amenities as stated by developer",
    category: "Amenities as stated by developer",
    synonyms: ["amenities_full_list"],
  },
];

const initialPropertySchemaFields = [
  [
    "property.name",
    "Property name",
    "string",
    "$.basics.property_name.value",
    "Proposed published property name; identity is curator-resolved before publication.",
  ],
  [
    "developer.name",
    "Developer name",
    "string",
    "$.basics.developer.value",
    "Proposed developer name; publication resolves the canonical developer record.",
  ],
  [
    "developer.profile_narrative",
    "Developer profile narrative",
    "string",
    "$.developer.profile_narrative",
    "Evidence-backed brochure narrative for the canonical developer profile.",
  ],
  [
    "property.type",
    "Property type",
    "property_type_key",
    "$.basics.category.value",
    "Normalizes only to an approved property type key.",
  ],
  [
    "property.city",
    "City",
    "city_name",
    "$.basics.city.value",
    "Canonical city after location review.",
  ],
  [
    "property.locality",
    "Locality",
    "locality_name",
    "$.basics.location.value",
    "Canonical locality after location review.",
  ],
  [
    "property.possession_status",
    "Possession status",
    "possession_status",
    "$.basics.status.value",
    "Maps only to a canonical possession-status enum; ambiguity requires review.",
  ],
  [
    "property.possession_date",
    "Possession date",
    "date",
    "$.basics.possession.value",
    "Parsed possession date; approximate wording requires review.",
  ],
  [
    "property.total_towers",
    "Total towers",
    "positive_integer",
    "$.project_structure.towers.value",
    "Project-level tower count.",
  ],
  [
    "property.total_floors",
    "Total floors",
    "positive_integer",
    "$.property.total_floors",
    "Project-level storey count as explicitly stated by the brochure.",
  ],
  [
    "property.total_units",
    "Total units",
    "positive_integer",
    "$.project_structure.units.value",
    "Project-level unit count.",
  ],
  [
    "property.plot_area_sqft",
    "Plot area",
    "positive_number",
    "$.property.plot_area_sqft",
    "Brochure-stated plot or land area normalized to square feet; independent of RERA land area.",
  ],
  [
    "property.rera_registration_number",
    "RERA registration number",
    "rera_registration_number",
    "$.rera.rera_id.value",
    "OCR never sets RERA verification or a verified badge.",
  ],
  [
    "property.rera_construction_progress_percent",
    "RERA construction progress",
    "percentage_0_to_100",
    "$.rera.construction_progress.value",
    "RERA-declared progress after inclusive 0–100 validation.",
  ],
  [
    "property.legal_entity_id",
    "Promoter legal entity",
    "legal_entity_id",
    "$.rera.promoter_legal_entity",
    "Chosen by an admin from the developer's recorded legal entities; never extracted by OCR and not shown to buyers yet.",
  ],
  [
    "property.pincode",
    "Pincode",
    "pincode",
    "$.basics.pincode.value",
    "Six-digit postal PIN code, as printed on the brochure or confirmed from RERA.",
  ],
  [
    "property.launch_date",
    "Launch date",
    "date",
    "$.basics.launch.value",
    "When the project was launched for sale, as stated by the brochure. RERA does not report this.",
  ],
  [
    "property.rera_project_land_area_sqft",
    "RERA project land area",
    "positive_number",
    null,
    "The project's registered land area from RERA only, in square feet; independent of the brochure's plot area and never asked of the extraction model.",
  ],
  [
    "property.rera_snapshot",
    "RERA project facts",
    "rera_snapshot",
    null,
    "The regulator's latest project facts no other source states, as one versioned object with the quarter and dates they are as on; RERA only, applied in the RERA panel, never asked of the extraction model.",
  ],
  [
    "property.latitude",
    "Latitude",
    "positive_number",
    null,
    "The project's latitude in degrees (India), proposed from the centre of the boundary RERA draws; confirmed or corrected by an admin.",
  ],
  [
    "property.longitude",
    "Longitude",
    "positive_number",
    null,
    "The project's longitude in degrees (India), proposed from the centre of the boundary RERA draws; confirmed or corrected by an admin.",
  ],
  [
    "unit_variants",
    "Unit configurations",
    "unit_variant_array",
    "$.configurations[*]",
    "Reviewed variants contain BHK and layout keys, variant name, explicit counts including units per floor, areas, and supported dimensions.",
  ],
  [
    "property.amenities",
    "Amenities",
    "amenity_key_array",
    "$.amenities[*].value",
    "Matches only approved amenity keys and synonyms; unmatched text requires catalog review.",
  ],
  [
    "property.amenities_removed",
    "Amenities to remove",
    "amenity_key_array",
    "$.edit.amenities_removed",
    "Amenities an edit takes off a live listing; applied to an existing property only and never read from a brochure.",
  ],
  [
    "unit_variants_removed",
    "Unit types to remove",
    "variant_name_array",
    "$.edit.unit_variants_removed",
    "Names of unit types an edit takes off a live listing (hidden, not deleted); existing property only, never read from a brochure.",
  ],
  [
    "property.media_removed",
    "Pictures to remove",
    "media_id_array",
    "$.edit.media_removed",
    "Ids of published pictures an edit takes off a live listing (hidden, not deleted); existing property only, never read from a brochure.",
  ],
  [
    "property.google_maps_url",
    "Google Maps link",
    "map_url",
    "$.google_maps_url",
    "The project's Google Maps link, set by an admin. A full link is also drawn as a small map on the dossier; a short share link opens in Google Maps only. Never read from a brochure.",
  ],
  [
    "property.main_photo",
    "Main photo",
    "media_id",
    "$.main_photo",
    "The picture that stands for the project on listing cards, comparison columns and the dossier: the id of a live picture, or of a new one proposed in this submission. A photo only; chosen by an admin, never read from a brochure.",
  ],
  [
    "property.listing_status",
    "Listing status",
    "listing_status",
    "$.edit.listing_status",
    "Whether buyers can see the property: listed, unlisted or deleted (soft). Existing property only, never read from a brochure.",
  ],
  [
    "property.specifications.construction_quality",
    "Construction quality",
    "specification_text",
    "$.construction_amenities.construction_quality.value",
    "Evidence-backed display text.",
  ],
  [
    "property.specifications.flooring",
    "Flooring",
    "specification_text",
    "$.construction_amenities.flooring.value",
    "Evidence-backed display text.",
  ],
  [
    "property.specifications.sanitary_fittings",
    "Bath & sanitary fittings",
    "specification_text",
    "$.construction_amenities.bath_sanitary_fittings.value",
    "Evidence-backed display text.",
  ],
  [
    "property.specifications.window_glazing",
    "Window glazing",
    "specification_text",
    "$.construction_amenities.window_glasses.value",
    "Evidence-backed display text.",
  ],
  [
    "property.specifications.ceiling_height",
    "Ceiling height",
    "specification_text",
    "$.construction_amenities.internal_ceiling_height.value",
    "Preserves reviewed display text without silent unit conversion.",
  ],
  [
    "property.specifications.open_space",
    "Open space",
    "specification_text",
    "$.construction_amenities.open_space.value",
    "Evidence-backed display text.",
  ],
  [
    "property.specifications.podium_structure",
    "Podium structure",
    "specification_text",
    "$.construction_amenities.podium_structure.value",
    "Evidence-backed display text.",
  ],
  [
    "property.specifications.clubhouse_size",
    "Clubhouse size",
    "specification_text",
    "$.construction_amenities.clubhouse_size.value",
    "Preserves reviewed display text without silent unit conversion.",
  ],
  [
    "property.specifications.lifts_per_tower",
    "Lifts per tower",
    "specification_text",
    "$.construction_amenities.lifts_per_tower.value",
    "Preserves reviewed display text without silent unit conversion.",
  ],
  [
    "property.specifications.parking_levels",
    "Parking levels",
    "specification_text",
    "$.construction_amenities.parking_levels.value",
    "Preserves reviewed display text without silent unit conversion.",
  ],
  [
    "property.specifications.density_units_per_acre",
    "Units per acre",
    "specification_text",
    "$.construction_amenities.density_units_per_acre.value",
    "Preserves reviewed display text without silent unit conversion.",
  ],
  [
    "property.specifications.geyser_heat_pump",
    "Geyser / heat pump",
    "specification_text",
    "$.construction_amenities.geyser_heat_pump.value",
    "Evidence-backed display text.",
  ],
  [
    "property.specifications.vrv_ac_provided",
    "VRV air conditioning",
    "specification_text",
    "$.construction_amenities.vrv_ac_provided.value",
    "Evidence-backed display text.",
  ],
  [
    "property.specifications.windows",
    "Windows",
    "specification_text",
    "$.construction_amenities.windows.value",
    "Window material (frame/glass make), distinct from window_glazing's glazing spec.",
  ],
  [
    "property.specifications.doors",
    "Doors",
    "specification_text",
    "$.construction_amenities.doors.value",
    "Evidence-backed display text.",
  ],
  [
    "property.specifications.toilet_flooring_dado",
    "Toilet flooring & dado",
    "specification_text",
    "$.construction_amenities.toilet_flooring_dado.value",
    "Evidence-backed display text.",
  ],
  [
    "property.specifications.wall_finishing",
    "Wall finishing",
    "specification_text",
    "$.construction_amenities.wall_finishing.value",
    "Evidence-backed display text.",
  ],
  [
    "property.specifications.kitchen_finishes",
    "Kitchen finishes",
    "specification_text",
    "$.construction_amenities.kitchen_finishes.value",
    "Evidence-backed display text.",
  ],
  [
    "property.specifications.material_tolerances",
    "Material tolerances",
    "specification_text",
    "$.construction_amenities.material_tolerances.value",
    "Evidence-backed display text.",
  ],
  [
    "property.specifications.electricals",
    "Electricals",
    "specification_text",
    "$.construction_amenities.electricals.value",
    "Evidence-backed display text.",
  ],
  [
    "property.specifications.power_backup",
    "Power backup",
    "specification_text",
    "$.construction_amenities.power_backup.value",
    "Evidence-backed display text.",
  ],
  [
    "property.specifications.waterproofing",
    "Waterproofing",
    "specification_text",
    "$.construction_amenities.waterproofing.value",
    "Evidence-backed display text.",
  ],
  [
    "property.specifications.drainage",
    "Drainage",
    "specification_text",
    "$.construction_amenities.drainage.value",
    "Evidence-backed display text.",
  ],
  [
    "property.specifications.damp_proofing",
    "Damp proofing",
    "specification_text",
    "$.construction_amenities.damp_proofing.value",
    "Evidence-backed display text.",
  ],
  [
    "property.specifications.safety_features",
    "Safety features",
    "specification_text",
    "$.construction_amenities.safety_features.value",
    "Evidence-backed display text.",
  ],
  [
    "property.specifications.special_features",
    "Special features",
    "specification_text",
    "$.construction_amenities.special_features.value",
    "Evidence-backed display text.",
  ],
  [
    "property.specifications.courtyard_area",
    "Courtyard area",
    "specification_text",
    "$.construction_amenities.courtyard_area.value",
    "Preserves reviewed display text without silent unit conversion.",
  ],
  [
    "property.specifications.vastu_compliance",
    "Vastu compliance",
    "specification_text",
    "$.construction_amenities.vastu_compliance.value",
    "Whether and by whom Vastu compliance is certified, exactly as printed.",
  ],
  [
    "property.specifications.plot_no",
    "Plot number",
    "specification_text",
    "$.construction_amenities.plot_no.value",
    "Evidence-backed display text.",
  ],
  [
    "property.specifications.nearby_connectivity",
    "Nearby connectivity",
    "specification_text",
    "$.construction_amenities.nearby_connectivity.value",
    "Named landmarks/transit and their stated travel time, exactly as printed (e.g. a metro station or airport). Never a claim this project invents.",
  ],
  [
    "property.specifications.nearby_hospitals",
    "Nearby hospitals",
    "specification_text",
    "$.construction_amenities.nearby_hospitals.value",
    "Named hospitals and their stated travel time, exactly as printed.",
  ],
  [
    "property.specifications.nearby_schools",
    "Nearby schools & institutions",
    "specification_text",
    "$.construction_amenities.nearby_schools.value",
    "Named schools/institutions and their stated travel time, exactly as printed.",
  ],
  [
    "property.specifications.amenities_full_list",
    "Amenities as stated by developer",
    "specification_text",
    "$.construction_amenities.amenities_full_list.value",
    "Every amenity the brochure names, exactly as printed, including ones with no catalog match. Dossier-only: never a comparison row (unlike property.amenities, which is catalog-matched and does compare).",
  ],
] as const;

async function seed() {
  await db
    .insert(propertyTypes)
    .values(corePropertyTypes)
    .onConflictDoUpdate({
      target: propertyTypes.key,
      set: { label: sql`excluded.label` },
    });
  await db
    .insert(bhkTypes)
    .values(coreBhkTypes)
    .onConflictDoUpdate({
      target: bhkTypes.key,
      set: {
        label: sql`excluded.label`,
        bedroomCount: sql`excluded.bedroom_count`,
      },
    });
  await db
    .insert(layoutTypes)
    .values(coreLayoutTypes)
    .onConflictDoUpdate({
      target: layoutTypes.key,
      set: { label: sql`excluded.label` },
    });

  const seededAmenities = await db
    .insert(amenityCatalog)
    .values(
      initialAmenityCatalog.map(({ key, label, category }) => ({
        key,
        label,
        category,
      })),
    )
    .onConflictDoUpdate({
      target: amenityCatalog.key,
      set: {
        label: sql`excluded.label`,
        category: sql`excluded.category`,
      },
    })
    .returning({ id: amenityCatalog.id, key: amenityCatalog.key });
  const amenityIds = new Map(seededAmenities.map(({ id, key }) => [key, id]));

  await db
    .insert(amenitySynonyms)
    .values(
      initialAmenityCatalog.flatMap(({ key, synonyms }) => {
        const amenityCatalogId = amenityIds.get(key);

        if (!amenityCatalogId) {
          throw new Error(`Missing seeded amenity catalog id for ${key}`);
        }

        return synonyms.map((synonymText) => ({
          amenityCatalogId,
          synonymText,
        }));
      }),
    )
    .onConflictDoNothing();

  const seededSpecifications = await db
    .insert(specificationCatalog)
    .values(
      initialSpecificationCatalog.map(({ key, label, category }) => ({
        key,
        label,
        category,
      })),
    )
    .onConflictDoUpdate({
      target: specificationCatalog.key,
      set: {
        label: sql`excluded.label`,
        category: sql`excluded.category`,
      },
    })
    .returning({ id: specificationCatalog.id, key: specificationCatalog.key });
  const specificationIds = new Map(
    seededSpecifications.map(({ id, key }) => [key, id]),
  );

  await db
    .insert(specificationSynonyms)
    .values(
      initialSpecificationCatalog.flatMap(({ key, synonyms }) => {
        const specificationCatalogId = specificationIds.get(key);

        if (!specificationCatalogId) {
          throw new Error(`Missing seeded specification catalog id for ${key}`);
        }

        return synonyms.map((synonymText) => ({
          specificationCatalogId,
          synonymText,
        }));
      }),
    )
    .onConflictDoNothing();

  await db
    .insert(propertySchemaFields)
    .values(
      initialPropertySchemaFields.map(
        ([fieldKey, label, dataType, jsonbPath, description]) => ({
          fieldKey,
          label,
          dataType,
          jsonbPath,
          schemaVersion: [
            "property.rera_snapshot",
            "property.latitude",
            "property.longitude",
          ].includes(fieldKey)
            ? "v17"
            : fieldKey === "property.google_maps_url"
              ? "v15"
              : fieldKey === "property.main_photo"
                ? "v14"
                : [
                      "developer.profile_narrative",
                      "property.total_floors",
                      "property.plot_area_sqft",
                      "unit_variants",
                    ].includes(fieldKey)
                  ? "v5"
                  : fieldKey === "property.legal_entity_id"
                    ? "v6"
                    : [
                          "property.amenities_removed",
                          "unit_variants_removed",
                          "property.listing_status",
                        ].includes(fieldKey)
                      ? "v8"
                      : [
                            "property.media_removed",
                            "property.pincode",
                            "property.launch_date",
                            "property.rera_project_land_area_sqft",
                          ].includes(fieldKey)
                        ? "v9"
                        : [
                              "property.specifications.windows",
                              "property.specifications.doors",
                              "property.specifications.toilet_flooring_dado",
                              "property.specifications.wall_finishing",
                              "property.specifications.kitchen_finishes",
                              "property.specifications.material_tolerances",
                              "property.specifications.electricals",
                              "property.specifications.power_backup",
                              "property.specifications.waterproofing",
                              "property.specifications.drainage",
                              "property.specifications.damp_proofing",
                              "property.specifications.safety_features",
                              "property.specifications.special_features",
                              "property.specifications.courtyard_area",
                              "property.specifications.vastu_compliance",
                              "property.specifications.plot_no",
                              "property.specifications.nearby_connectivity",
                              "property.specifications.nearby_hospitals",
                              "property.specifications.nearby_schools",
                              "property.specifications.amenities_full_list",
                            ].includes(fieldKey)
                          ? "v12"
                          : "v1",
          // Retired fields stay in the table, switched off (schema v18).
          isActive: !RETIRED_FIELD_KEYS.has(fieldKey),
          description,
        }),
      ),
    )
    .onConflictDoUpdate({
      target: propertySchemaFields.fieldKey,
      set: {
        label: sql`excluded.label`,
        dataType: sql`excluded.data_type`,
        jsonbPath: sql`excluded.jsonb_path`,
        schemaVersion: sql`excluded.schema_version`,
        isActive: sql`excluded.is_active`,
        description: sql`excluded.description`,
      },
    });

  console.info(
    "Seeded canonical property, BHK, layout, amenity, specification, and OCR field-contract lookup values.",
  );
}

try {
  await seed();
} finally {
  await dbClient.end({ timeout: 5 });
}
