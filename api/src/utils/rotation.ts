import db from "../db";

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

function normalizeDateUtc(date: Date) {
  const normalized = new Date(date);
  normalized.setUTCHours(0, 0, 0, 0);
  return normalized;
}

export function addDaysUtc(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  next.setUTCHours(0, 0, 0, 0);
  return next;
}

export function getWeekStartUtc(date: Date) {
  const d = normalizeDateUtc(date);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

export function getPeriodStartUtc(date: Date, anchorDay: number) {
  const d = normalizeDateUtc(date);
  const day = d.getUTCDay();
  const diff = (day - anchorDay + 7) % 7;
  d.setUTCDate(d.getUTCDate() - diff);
  return d;
}

export function formatDateOnlyUtc(value: Date) {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getRotationWeekIndex(startDate: Date, targetDate: Date) {
  const anchorDay = normalizeDateUtc(startDate).getUTCDay();
  const normalizedStart = getPeriodStartUtc(startDate, anchorDay);
  const normalizedTarget = getPeriodStartUtc(targetDate, anchorDay);
  const diff = normalizedTarget.getTime() - normalizedStart.getTime();
  return Math.floor(diff / MS_PER_WEEK);
}

export type RotationProjection = {
  rotationId: number;
  weekIndex: number;
  templateMenuId: number;
  templateName: string | null;
  periodStartDate: Date;
};

export function projectRotationWeek(
  rotation: {
    id: number;
    startDate: Date;
    maxCycles: number | null;
    templates: Array<{
      templateMenuId: number;
      templateMenu: { name: string | null };
    }>;
  },
  targetDate: Date,
): RotationProjection | null {
  if (rotation.templates.length === 0) {
    return null;
  }

  const weekIndex = getRotationWeekIndex(rotation.startDate, targetDate);
  if (weekIndex < 0) {
    return null;
  }

  const maxWeeks =
    rotation.maxCycles !== null
      ? rotation.maxCycles * rotation.templates.length
      : null;
  if (maxWeeks !== null && weekIndex >= maxWeeks) {
    return null;
  }

  const template = rotation.templates[weekIndex % rotation.templates.length];
  const periodStartDate = getPeriodStartUtc(
    targetDate,
    normalizeDateUtc(rotation.startDate).getUTCDay(),
  );

  return {
    rotationId: rotation.id,
    weekIndex,
    templateMenuId: template.templateMenuId,
    templateName: template.templateMenu.name,
    periodStartDate,
  };
}

export async function getActiveRotationForProjection(userId: number) {
  return db.menuRotation.findFirst({
    where: { userId, isActive: true },
    include: {
      templates: {
        orderBy: { orderIndex: "asc" },
        include: {
          templateMenu: {
            select: { id: true, name: true },
          },
        },
      },
    },
  });
}

export async function resolveWeekMenu(userId: number, targetDate: Date) {
  const normalizedTargetDate = normalizeDateUtc(targetDate);
  const periodWindowStart = addDaysUtc(normalizedTargetDate, -6);

  const existingVisible = await db.weeklyMenu.findFirst({
    where: {
      userId,
      isTemplate: false,
      hiddenFromCalendar: false,
      startDate: {
        lte: normalizedTargetDate,
        gte: periodWindowStart,
      },
    },
    orderBy: [{ startDate: "desc" }, { id: "desc" }],
    include: {
      menuEntries: {
        include: {
          recipe: { select: { id: true, name: true, image: true } },
        },
        orderBy: [{ dayOffset: "asc" }, { mealType: "asc" }],
      },
    },
  });

  if (existingVisible) {
    return existingVisible;
  }

  const activeRotation = await db.menuRotation.findFirst({
    where: { userId, isActive: true },
    include: {
      templates: {
        orderBy: { orderIndex: "asc" },
        include: {
          templateMenu: {
            include: {
              menuEntries: {
                orderBy: [{ dayOffset: "asc" }, { mealType: "asc" }],
              },
            },
          },
        },
      },
    },
  });

  if (!activeRotation || activeRotation.templates.length === 0) {
    return null;
  }

  const projection = projectRotationWeek(activeRotation, normalizedTargetDate);
  if (!projection) {
    return null;
  }

  const anyExisting = await db.weeklyMenu.findFirst({
    where: {
      userId,
      isTemplate: false,
      startDate: projection.periodStartDate,
    },
    include: {
      menuEntries: {
        include: {
          recipe: { select: { id: true, name: true, image: true } },
        },
        orderBy: [{ dayOffset: "asc" }, { mealType: "asc" }],
      },
    },
  });

  if (anyExisting) {
    if (
      anyExisting.hiddenFromCalendar &&
      anyExisting.rotationId === activeRotation.id
    ) {
      const restored = await db.weeklyMenu.update({
        where: { id: anyExisting.id },
        data: { hiddenFromCalendar: false },
        include: {
          menuEntries: {
            include: {
              recipe: { select: { id: true, name: true, image: true } },
            },
            orderBy: [{ dayOffset: "asc" }, { mealType: "asc" }],
          },
        },
      });
      return restored;
    }

    return null;
  }

  const template =
    activeRotation.templates[
      projection.weekIndex % activeRotation.templates.length
    ];

  const createdMenu = await db.weeklyMenu.create({
    data: {
      userId,
      name: template.templateMenu.name,
      isTemplate: false,
      tags: [],
      startDate: projection.periodStartDate,
      rotationId: activeRotation.id,
      rotationWeekIndex: projection.weekIndex,
      hiddenFromCalendar: false,
    },
  });

  if (template.templateMenu.menuEntries.length > 0) {
    await db.menuEntry.createMany({
      data: template.templateMenu.menuEntries.map((entry) => ({
        weeklyMenuId: createdMenu.id,
        dayOffset: entry.dayOffset,
        mealType: entry.mealType,
        recipeId: entry.recipeId,
        note: entry.note,
      })),
    });
  }

  if (activeRotation.nextWeekIndex <= projection.weekIndex) {
    await db.menuRotation.update({
      where: { id: activeRotation.id },
      data: { nextWeekIndex: projection.weekIndex + 1 },
    });
  }

  return db.weeklyMenu.findFirst({
    where: { id: createdMenu.id, userId },
    include: {
      menuEntries: {
        include: {
          recipe: { select: { id: true, name: true, image: true } },
        },
        orderBy: [{ dayOffset: "asc" }, { mealType: "asc" }],
      },
    },
  });
}

export async function generateWeeksForRotation(
  userId: number,
  rotationId: number,
  weeks: number,
) {
  const rotation = await db.menuRotation.findFirst({
    where: { id: rotationId, userId },
    include: {
      templates: {
        orderBy: { orderIndex: "asc" },
        include: {
          templateMenu: {
            include: {
              menuEntries: {
                orderBy: [{ dayOffset: "asc" }, { mealType: "asc" }],
              },
            },
          },
        },
      },
    },
  });

  if (!rotation) {
    throw new Error("Rotation not found");
  }

  if (rotation.templates.length === 0) {
    throw new Error("Rotation has no templates");
  }

  const maxWeeks =
    rotation.maxCycles !== null
      ? rotation.maxCycles * rotation.templates.length
      : null;

  let attempted = 0;
  let generated = 0;
  const createdMenuIds: number[] = [];
  const conflicts: Array<{
    weekIndex: number;
    startDate: string;
    existingMenuId: number;
  }> = [];

  while (attempted < weeks) {
    const weekIndex = rotation.nextWeekIndex + attempted;

    if (maxWeeks !== null && weekIndex >= maxWeeks) {
      break;
    }

    const template = rotation.templates[weekIndex % rotation.templates.length];
    const targetStartDate = addDaysUtc(rotation.startDate, weekIndex * 7);

    const existingMenu = await db.weeklyMenu.findFirst({
      where: {
        userId,
        isTemplate: false,
        startDate: targetStartDate,
      },
      select: { id: true },
    });

    if (existingMenu) {
      conflicts.push({
        weekIndex,
        startDate: formatDateOnlyUtc(targetStartDate),
        existingMenuId: existingMenu.id,
      });
      attempted += 1;
      continue;
    }

    const createdMenu = await db.weeklyMenu.create({
      data: {
        userId,
        name: template.templateMenu.name,
        isTemplate: false,
        tags: [],
        startDate: targetStartDate,
        rotationId: rotation.id,
        rotationWeekIndex: weekIndex,
        hiddenFromCalendar: false,
      },
    });

    if (template.templateMenu.menuEntries.length > 0) {
      await db.menuEntry.createMany({
        data: template.templateMenu.menuEntries.map((entry) => ({
          weeklyMenuId: createdMenu.id,
          dayOffset: entry.dayOffset,
          mealType: entry.mealType,
          recipeId: entry.recipeId,
          note: entry.note,
        })),
      });
    }

    createdMenuIds.push(createdMenu.id);
    generated += 1;
    attempted += 1;
  }

  if (attempted > 0) {
    await db.menuRotation.update({
      where: { id: rotation.id },
      data: {
        nextWeekIndex: rotation.nextWeekIndex + attempted,
      },
    });
  }

  return {
    generated,
    attempted,
    createdMenuIds,
    conflicts,
  };
}
