-- CreateTable
CREATE TABLE "Server" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "host" INTEGER
);

-- CreateTable
CREATE TABLE "Port" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "note" TEXT,
    "port" INTEGER NOT NULL
);
