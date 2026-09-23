-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Tier" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tierDiscountId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "discountType" TEXT NOT NULL DEFAULT 'FIXED',
    "price" REAL NOT NULL,
    "label" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Tier_tierDiscountId_fkey" FOREIGN KEY ("tierDiscountId") REFERENCES "TierDiscount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Tier" ("id", "label", "position", "price", "quantity", "tierDiscountId") SELECT "id", "label", "position", "price", "quantity", "tierDiscountId" FROM "Tier";
DROP TABLE "Tier";
ALTER TABLE "new_Tier" RENAME TO "Tier";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
