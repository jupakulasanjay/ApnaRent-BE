import "dotenv/config"
import express from "express"
import cors from "cors"
import path from "path"

import authRoutes from "./routes/authRoutes.js"
import propertyRoutes from "./routes/propertyRoutes.js"
import listingRoutes from "./routes/listingRoutes.js"
import adminRoutes from "./routes/adminRoutes.js"
import searchRoutes from "./routes/searchRoutes.js"
import contactRoutes from "./routes/contactRoutes.js"
import { notFound, errorHandler } from "./middleware/errorMiddleware.js"

const app = express()

app.use(cors())
app.use(express.json())

app.use("/uploads", express.static(path.resolve("uploads")))

app.get("/", (req, res) => {
  res.send("ApnaRent API v1.1 running 🚀")
})

// Legacy redirects — drop after the FE deprecation window closes.
// 308 preserves method + body (so POST/PUT redirect correctly).
function legacyRedirect(fromPrefix, toPrefix) {
  return (req, res) => {
    const tail = req.originalUrl.slice(fromPrefix.length)
    res.redirect(308, toPrefix + tail)
  }
}
app.use("/api/buildings",      legacyRedirect("/api/buildings",      "/api/properties"))
app.use("/api/units",          legacyRedirect("/api/units",          "/api/listings"))
app.use("/api/admin/units",    legacyRedirect("/api/admin/units",    "/api/admin/listings"))

app.use("/api/auth",       authRoutes)
app.use("/api/properties", propertyRoutes)
app.use("/api/listings",   listingRoutes)
app.use("/api/admin",      adminRoutes)
app.use("/api/search",     searchRoutes)
app.use("/api/contact",    contactRoutes)

app.use(notFound)
app.use(errorHandler)

const PORT = process.env.PORT || 5001

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})
