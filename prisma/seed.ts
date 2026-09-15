import { PrismaClient, type ChecklistType } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

/**
 * Seeds a demo team, two properties, the two default checklists and a few
 * scheduling rules — enough to click through every screen. Safe to re-run.
 */

const TURNOVER_ITEMS: [string, string, string?][] = [
  ["Kitchen", "Empty and wipe out the fridge", "Bin anything the guest left"],
  ["Kitchen", "Run and empty the dishwasher"],
  ["Kitchen", "Wipe counters, sink and hob"],
  ["Kitchen", "Restock coffee, tea, dish soap and sponges"],
  ["Kitchen", "Sweep and mop the floor"],
  ["Bathrooms", "Scrub the shower, bath and tiles"],
  ["Bathrooms", "Clean the toilet inside and out"],
  ["Bathrooms", "Polish mirrors and taps"],
  ["Bathrooms", "Fresh towels — 2 bath, 2 hand, 1 mat per bathroom"],
  ["Bathrooms", "Restock toilet paper (2 spare rolls) and soap"],
  ["Bedrooms", "Strip all beds and start the laundry"],
  ["Bedrooms", "Make beds with fresh linen"],
  ["Bedrooms", "Check under beds and in drawers for left items"],
  ["Bedrooms", "Dust surfaces and vacuum"],
  ["Living areas", "Vacuum carpets and rugs"],
  ["Living areas", "Mop hard floors"],
  ["Living areas", "Straighten cushions and throws"],
  ["Living areas", "Empty every bin and replace the liner"],
  ["Final check", "Set the thermostat to 21°C / 70°F"],
  ["Final check", "Turn off all lights and lock up"],
  ["Final check", "Photograph the finished living room", "Proof the turnover is done"],
  ["Final check", "Report anything broken, missing or worn"],
];

const DEEP_CLEAN_ITEMS: [string, string, string?][] = [
  ["Appliances", "Clean the oven inside, racks included"],
  ["Appliances", "Descale the kettle and coffee machine"],
  ["Appliances", "Pull out and clean behind the fridge"],
  ["Appliances", "Run a hot empty cycle in the washing machine"],
  ["Deep surfaces", "Wash all interior windows and sills"],
  ["Deep surfaces", "Wipe down skirting boards and door frames"],
  ["Deep surfaces", "Dust light fittings, ceiling fans and vents"],
  ["Deep surfaces", "Wash walls where marked"],
  ["Soft furnishings", "Vacuum under all furniture"],
  ["Soft furnishings", "Spot-clean sofas and upholstery"],
  ["Soft furnishings", "Wash mattress protectors and shower curtains"],
  ["Soft furnishings", "Launder throws and cushion covers"],
  ["Maintenance sweep", "Test every smoke and CO alarm", "Replace batteries if needed"],
  ["Maintenance sweep", "Replace HVAC filters"],
  ["Maintenance sweep", "Check for leaks under every sink"],
  ["Maintenance sweep", "Test every lamp, bulb and remote"],
  ["Inventory", "Count linen and towel sets against par level"],
  ["Inventory", "Count crockery, glassware and cutlery"],
  ["Inventory", "Restock all consumables to full"],
  ["Inventory", "Photograph each room for the records"],
];

async function upsertUser(input: {
  email: string;
  name: string;
  role: "MANAGER" | "CLEANER" | "MAINTENANCE";
  password: string;
  skills?: string[];
  color: string;
  maxDailyTasks?: number;
}) {
  const passwordHash = await bcrypt.hash(input.password, 11);
  return prisma.user.upsert({
    where: { email: input.email },
    create: {
      email: input.email,
      name: input.name,
      role: input.role,
      passwordHash,
      skills: input.skills ?? [],
      avatarColor: input.color,
      maxDailyTasks: input.maxDailyTasks ?? 4,
      timezone: "America/New_York",
      // Short-term rental turnovers happen every day of the week, so the
      // default window is 7 days, 8am–8pm. Managers narrow this per person.
      availability: {
        create: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
          dayOfWeek,
          startMin: 8 * 60,
          endMin: 20 * 60,
        })),
      },
    },
    update: { name: input.name, role: input.role, avatarColor: input.color },
  });
}

async function upsertChecklist(
  name: string,
  type: ChecklistType,
  items: [string, string, string?][],
) {
  const existing = await prisma.checklistTemplate.findFirst({
    where: { name, propertyId: null },
  });
  if (existing) {
    await prisma.checklistTemplateItem.deleteMany({ where: { templateId: existing.id } });
    await prisma.checklistTemplateItem.createMany({
      data: items.map(([section, title, description], position) => ({
        templateId: existing.id,
        section,
        title,
        description: description ?? null,
        position,
        photoRequired: title.toLowerCase().startsWith("photograph"),
      })),
    });
    return existing;
  }

  return prisma.checklistTemplate.create({
    data: {
      name,
      type,
      propertyId: null,
      description: `Default ${type.toLowerCase().replace("_", " ")} checklist for every property.`,
      items: {
        create: items.map(([section, title, description], position) => ({
          section,
          title,
          description: description ?? null,
          position,
          photoRequired: title.toLowerCase().startsWith("photograph"),
        })),
      },
    },
  });
}

async function main() {
  console.log("Seeding…");

  const manager = await upsertUser({
    email: "manager@example.com",
    name: "Alex Morgan",
    role: "MANAGER",
    password: "changeme123",
    color: "#1553dc",
  });

  const maria = await upsertUser({
    email: "maria@example.com",
    name: "Maria Santos",
    role: "CLEANER",
    password: "changeme123",
    skills: ["deep-clean", "laundry"],
    color: "#7c3aed",
    maxDailyTasks: 3,
  });

  const jamie = await upsertUser({
    email: "jamie@example.com",
    name: "Jamie Lee",
    role: "CLEANER",
    password: "changeme123",
    skills: ["laundry"],
    color: "#059669",
  });

  const sam = await upsertUser({
    email: "sam@example.com",
    name: "Sam Rivera",
    role: "MAINTENANCE",
    password: "changeme123",
    skills: ["plumbing", "electrical", "hvac"],
    color: "#ea580c",
  });

  const turnoverList = await upsertChecklist("Standard turnover", "TURNOVER", TURNOVER_ITEMS);
  const deepCleanList = await upsertChecklist("Monthly deep clean", "DEEP_CLEAN", DEEP_CLEAN_ITEMS);

  const properties = [
    {
      name: "Seaside Cottage",
      city: "Wilmington",
      state: "NC",
      bedrooms: 2,
      bathrooms: 1.5,
      color: "#0ea5e9",
      turnoverMinutes: 150,
      deepCleanDayOfMonth: 5,
      accessNotes: "Lockbox to the right of the front door. Code is in the manager's notes.",
    },
    {
      name: "Downtown Loft",
      city: "Raleigh",
      state: "NC",
      bedrooms: 1,
      bathrooms: 1,
      color: "#8b5cf6",
      turnoverMinutes: 120,
      deepCleanDayOfMonth: 12,
      accessNotes: "Building code at the main door, then keypad 2B.",
    },
    {
      name: "Ridge House",
      city: "Asheville",
      state: "NC",
      bedrooms: 4,
      bathrooms: 3,
      color: "#f59e0b",
      turnoverMinutes: 300,
      deepCleanDayOfMonth: 20,
      accessNotes: "Gate opener is in the kitchen drawer. Steep driveway — park at the top.",
    },
  ];

  for (const input of properties) {
    const existing = await prisma.property.findFirst({ where: { name: input.name } });
    if (existing) continue;
    await prisma.property.create({
      data: { ...input, timezone: "America/New_York", country: "US" },
    });
  }

  const seaside = await prisma.property.findFirst({ where: { name: "Seaside Cottage" } });
  const ridge = await prisma.property.findFirst({ where: { name: "Ridge House" } });

  if (seaside) {
    await prisma.propertyAssignment.upsert({
      where: { propertyId_userId: { propertyId: seaside.id, userId: maria.id } },
      create: { propertyId: seaside.id, userId: maria.id, priority: 1 },
      update: { priority: 1 },
    });
  }
  if (ridge) {
    await prisma.propertyAssignment.upsert({
      where: { propertyId_userId: { propertyId: ridge.id, userId: jamie.id } },
      create: { propertyId: ridge.id, userId: jamie.id, priority: 1 },
      update: { priority: 1 },
    });
  }

  const rules = [
    {
      name: "Keep cleaners on properties they know",
      instruction:
        "Prefer someone who has already completed jobs at the property. Familiarity matters more than a slightly lighter workload.",
      kind: "ASSIGNMENT" as const,
      weight: 7,
    },
    {
      name: "Don't send people across the county twice",
      instruction:
        "Avoid giving one person two jobs more than 25 km apart on the same day. If it's unavoidable, put the far one first.",
      kind: "TIMING" as const,
      weight: 6,
    },
    {
      name: "Same-day turns go to the safest pair of hands",
      instruction:
        "When a job is a same-day turn, assign the person with the most completed jobs at that property. Missing a same-day turn means a guest walks into a dirty house.",
      kind: "ASSIGNMENT" as const,
      weight: 9,
    },
    {
      name: "Spread the work",
      instruction:
        "All else being close, give the job to whoever has the lightest day. Nobody should sit at their cap while somebody else has nothing.",
      kind: "WORKLOAD" as const,
      weight: 5,
    },
    {
      name: "Deep cleans need a deep-clean tag",
      instruction: "Only staff tagged deep-clean may be scheduled for a monthly deep clean.",
      kind: "ASSIGNMENT" as const,
      weight: 10,
      hard: true,
      taskTypes: ["DEEP_CLEAN" as const],
      config: { requireSkill: "deep-clean" },
    },
  ];

  for (const rule of rules) {
    const existing = await prisma.schedulingRule.findFirst({ where: { name: rule.name } });
    if (existing) continue;
    await prisma.schedulingRule.create({
      data: {
        name: rule.name,
        instruction: rule.instruction,
        kind: rule.kind,
        weight: rule.weight,
        hard: rule.hard ?? false,
        taskTypes: rule.taskTypes ?? [],
        config: (rule.config ?? undefined) as object | undefined,
      },
    });
  }

  console.log(`
Seed complete.

  Manager      manager@example.com  / changeme123
  Cleaner      maria@example.com    / changeme123
  Cleaner      jamie@example.com    / changeme123
  Maintenance  sam@example.com      / changeme123

Change these passwords before putting anything real in.
Checklists: "${turnoverList.name}", "${deepCleanList.name}".
Manager id: ${manager.id}, maintenance id: ${sam.id}
`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
