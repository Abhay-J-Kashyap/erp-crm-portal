import { PrismaClient, Role, CustomerType, CustomerStatus, MovementType } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

/**
 * SEED SCRIPT
 * -----------
 * Populates the database with known test data. Two reasons this matters:
 *
 *   1. Your submission requires "test login credentials for all roles".
 *      Whoever reviews this must be able to log in within 60 seconds.
 *   2. You can wipe and rebuild a clean database any time with one command,
 *      instead of clicking through your own UI to recreate test data.
 *
 * Written to be IDEMPOTENT — safe to run repeatedly. That's what `upsert`
 * gives us: update the row if it exists, create it if it doesn't.
 */

const main = async () => {
  console.log("Seeding database...");

  // --- Users, one per role ---
  // bcrypt hashes are deliberately SLOW (~100ms). That slowness is the
  // security feature: it makes brute-forcing millions of guesses impractical.
  // The "10" is the cost factor — each +1 doubles the work.
  const passwordHash = await bcrypt.hash("Password@123", 10);

  const userSeed = [
    { name: "Admin User", email: "admin@erp.com", role: Role.ADMIN },
    { name: "Sales User", email: "sales@erp.com", role: Role.SALES },
    { name: "Warehouse User", email: "warehouse@erp.com", role: Role.WAREHOUSE },
    { name: "Accounts User", email: "accounts@erp.com", role: Role.ACCOUNTS },
  ];

  const users = [];
  for (const u of userSeed) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {}, // exists already? leave it alone
      create: { ...u, passwordHash },
    });
    users.push(user);
    console.log(`  user: ${user.email} (${user.role})`);
  }

  const admin = users[0];

  // --- Customers ---
  const customerSeed = [
    {
      name: "Rajesh Sharma",
      mobile: "9876543210",
      email: "rajesh@sharmatraders.com",
      businessName: "Sharma Traders",
      gstNumber: "29ABCDE1234F1Z5",
      customerType: CustomerType.WHOLESALE,
      city: "Bengaluru",
      state: "Karnataka",
      status: CustomerStatus.ACTIVE,
    },
    {
      name: "Priya Nair",
      mobile: "9845012345",
      email: "priya@nairdistribution.com",
      businessName: "Nair Distribution",
      gstNumber: "29XYZAB5678C1Z9",
      customerType: CustomerType.DISTRIBUTOR,
      city: "Mysuru",
      state: "Karnataka",
      status: CustomerStatus.ACTIVE,
    },
    {
      name: "Amit Kumar",
      mobile: "9812345678",
      businessName: "Kumar Hardware",
      customerType: CustomerType.RETAIL,
      city: "Hubballi",
      state: "Karnataka",
      status: CustomerStatus.LEAD,
    },
  ];

  const customers = [];
  for (const c of customerSeed) {
    // No unique field on customers, so we check-then-create manually.
    const existing = await prisma.customer.findFirst({
      where: { mobile: c.mobile },
    });
    const customer =
      existing ??
      (await prisma.customer.create({
        data: { ...c, createdById: admin.id },
      }));
    customers.push(customer);
    console.log(`  customer: ${customer.name}`);
  }

  // --- Products, each with an opening stock movement ---
  const productSeed = [
    { name: "Steel Pipe 2 inch", sku: "SP-2IN", category: "Pipes", unitPrice: "450.00", stock: 500, minAlert: 50, location: "Warehouse A" },
    { name: "PVC Elbow 90deg", sku: "PVC-EL90", category: "Fittings", unitPrice: "35.50", stock: 1200, minAlert: 200, location: "Warehouse A" },
    { name: "Brass Valve 1 inch", sku: "BV-1IN", category: "Valves", unitPrice: "890.00", stock: 150, minAlert: 30, location: "Warehouse B" },
    { name: "Copper Wire 2.5mm", sku: "CW-25MM", category: "Electrical", unitPrice: "1250.00", stock: 80, minAlert: 20, location: "Warehouse B" },
    { name: "Cement Bag 50kg", sku: "CEM-50", category: "Construction", unitPrice: "410.00", stock: 25, minAlert: 40, location: "Warehouse C" },
  ];

  for (const p of productSeed) {
    const existing = await prisma.product.findUnique({ where: { sku: p.sku } });
    if (existing) {
      console.log(`  product: ${p.sku} (exists)`);
      continue;
    }

    // $transaction: both writes succeed, or NEITHER does. A product must
    // never exist without the movement that explains its opening stock.
    // Covered properly in Part 7 — this is a preview.
    await prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          name: p.name,
          sku: p.sku,
          category: p.category,
          unitPrice: p.unitPrice,
          currentStock: p.stock,
          minStockAlert: p.minAlert,
          location: p.location,
        },
      });

      await tx.stockMovement.create({
        data: {
          productId: product.id,
          quantity: p.stock,
          movementType: MovementType.IN,
          reason: "Opening stock",
          stockAfter: p.stock,
          createdById: admin.id,
        },
      });
    });

    console.log(`  product: ${p.sku}`);
  }

  // Note: "Cement Bag 50kg" is seeded at 25 units against a 40-unit alert
  // threshold — deliberately below minimum, so your low-stock filter has
  // something to find on day one.

  await prisma.challanCounter.upsert({
    where: { year: new Date().getFullYear() },
    update: {},
    create: { year: new Date().getFullYear(), lastNumber: 0 },
  });

  console.log("Seed complete.");
  console.log("\nLogin with any of these — password: Password@123");
  userSeed.forEach((u) => console.log(`  ${u.email}`));
};

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    // Always release the connection, success or failure, or the script hangs.
    await prisma.$disconnect();
  });