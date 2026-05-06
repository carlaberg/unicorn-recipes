# Zod Schema Generation Workflow

This document explains how we use Prisma + Zod to maintain a single source of truth for both database schemas and API validation types.

## Overview

**Single Source of Truth:** `api/prisma/schema.prisma`

```
Prisma Schema
     ↓
(npx prisma generate)
     ↓
Generated Zod Schemas (in `api/prisma/generated/zod/`)
     ↓
Type Inference (z.infer<typeof Schema>)
     ↓
API Types & Validation
```

## Initial Setup

### 1. Install Dependencies

```bash
cd api
npm install zod prisma-zod-generator
```

### 2. Configure Prisma Generator

Add this to `api/prisma/schema.prisma`:

```prisma
generator zod {
  provider = "prisma-zod-generator"
  output   = "./generated/zod"
}
```

### 3. Generate Zod Schemas

```bash
npx prisma generate
```

This creates Zod schemas in `api/prisma/generated/zod/index.ts` matching your Prisma models.

## Workflow: Using Generated Schemas

### Example: Recipe API

**Before (Manual Interfaces):**

```typescript
interface CreateRecipeBody {
  name: string;
  ingredients?: IngredientInput[];
}

const ingredientSchema = {
  type: "object",
  required: ["name", "amount", "unit"],
  properties: {
    name: { type: "string" },
    amount: { type: "number" },
    unit: { type: "string" },
  },
};
```

**After (Zod-Generated):**

```typescript
import { z } from "zod";
import { RecipeCreateInputSchema } from "../prisma/generated/zod";

type CreateRecipeBody = z.infer<typeof RecipeCreateInputSchema>;
```

### In Route Handlers

```typescript
app.post<{ Body: CreateRecipeBody }>(
  "/create",
  async (
    request: FastifyRequest<{ Body: CreateRecipeBody }>,
    reply: FastifyReply,
  ) => {
    const { name, ingredients = [] } = request.body;
    // Types are automatically inferred from Prisma schema
    // Type safety on request.body
  },
);
```

## Workflow: Updating the Schema

When you modify `api/prisma/schema.prisma`:

### 1. Update Schema (Example: Add a `description` field)

```prisma
model Recipe {
  id          Int      @id @default(autoincrement())
  name        String
  description String?  // NEW FIELD
  userId      Int
  // ...
}
```

### 2. Generate New Schemas

```bash
npx prisma generate
```

### 3. Your Code Automatically Updates

The generated Zod schemas now include the `description` field, and any code importing from them gets updated types automatically. No manual interface changes needed.

## Generated Artifacts

**Location:** `api/prisma/generated/zod/`

**Contents:**

- Auto-generated Zod schemas for all models
- Input schemas: `RecipeCreateInputSchema`, `RecipeUpdateInputSchema`, etc.
- Output schemas matching database models

**.gitignore Entry:**
These files should be gitignored (they're artifacts like `node_modules`):

```
api/prisma/generated/
```

## Development Workflow Checklist

- [ ] Modify `api/prisma/schema.prisma` (your single source of truth)
- [ ] Run `npx prisma generate` to regenerate Zod schemas
- [ ] Commit only the schema changes; generated files are rebuilt on `npm install`
- [ ] Team members run `npm install && npx prisma generate` to sync locally

## Best Practices

### 1. Always Regenerate After Schema Changes

```bash
# Change schema.prisma
npx prisma generate
# Your types are now updated automatically
```

### 2. Add Pre-commit Hook (Optional)

To ensure schemas are always regenerated:

```bash
# In api/.husky/pre-commit or similar
npx prisma generate
git add api/prisma/generated/
```

### 3. Use Type Inference Consistently

```typescript
// ✅ Good: Let Zod infer the type
type CreateRecipeBody = z.infer<typeof RecipeCreateInputSchema>;

// ❌ Avoid: Manual duplicate interfaces
interface CreateRecipeBody {
  name: string;
  ingredients?: IngredientInput[];
}
```

### 4. Keep Prisma Schema Semantically Accurate

The better your Prisma schema, the better your generated types:

```prisma
// ✅ Good: Constraints help Zod generate correct validation
model Recipe {
  name String @db.VarChar(255)  // Bounded length
  createdAt DateTime @default(now())
}

// ❌ Avoid: Vague types
model Recipe {
  name String  // Unbounded
}
```

## Troubleshooting

### Generated Types Not Updated

**Solution:** Regenerate after schema changes:

```bash
npx prisma generate
```

### "Cannot find module '../prisma/generated/zod'"

**Cause:** Zod schemas haven't been generated yet.

**Solution:**

```bash
npm install
npx prisma generate
```

### Type Mismatches in Route Handlers

Ensure you're importing from the generated package:

```typescript
// ✅ Correct
import { RecipeCreateInputSchema } from "../prisma/generated/zod";

// ❌ Wrong
import { RecipeCreateInputSchema } from "./types"; // This file doesn't exist
```

## Migration Path

If you have existing manual interfaces, you can migrate gradually:

1. Generate Zod schemas with `npx prisma generate`
2. Replace imports one route at a time
3. Use `z.infer<typeof Schema>` instead of manual types
4. Commit the schema changes; delete generated files from git

## References

- **Zod:** https://zod.dev/
- **prisma-zod-generator:** https://github.com/omar-dulaimi/prisma-zod-generator
- **Prisma Generators:** https://www.prisma.io/docs/concepts/components/prisma-schema/generators
