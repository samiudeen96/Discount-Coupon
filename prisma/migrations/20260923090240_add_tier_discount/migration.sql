-- CreateTable
CREATE TABLE "TierDiscount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productGid" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Tier" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tierDiscountId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "price" REAL NOT NULL,
    "label" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Tier_tierDiscountId_fkey" FOREIGN KEY ("tierDiscountId") REFERENCES "TierDiscount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "TierDiscount_shop_productGid_key" ON "TierDiscount"("shop", "productGid");
