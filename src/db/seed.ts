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
  { key: "5bhk_plus", label: "5 BHK+", bedroomCount: 5 },
];

const coreLayoutTypes = [
  { key: "simplex", label: "Simplex" },
  { key: "duplex", label: "Duplex" },
  { key: "penthouse", label: "Penthouse" },
];

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
    "property.total_units",
    "Total units",
    "positive_integer",
    "$.project_structure.units.value",
    "Project-level unit count.",
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
    "unit_variants",
    "Unit configurations",
    "unit_variant_array",
    "$.configurations[*]",
    "Reviewed variants contain only BHK key, variant name, explicit areas, and supported dimensions.",
  ],
  [
    "property.amenities",
    "Amenities",
    "amenity_key_array",
    "$.amenities[*].value",
    "Matches only approved amenity keys and synonyms; unmatched text requires catalog review.",
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
          schemaVersion: "v1",
          isActive: true,
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
