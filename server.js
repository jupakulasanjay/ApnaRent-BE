import "dotenv/config"
import express from "express"
import cors from "cors"
import path from "path"

import authRoutes from "./routes/authRoutes.js"
import propertyRoutes from "./routes/propertyRoutes.js"
import rentalRoutes from "./routes/rentalRoutes.js"
import adminRoutes from "./routes/adminRoutes.js"
import searchRoutes from "./routes/searchRoutes.js"
import contactRoutes from "./routes/contactRoutes.js"
import interestRoutes from "./routes/interestRoutes.js"
import amenityRoutes from "./routes/amenityRoutes.js"
import { notFound, errorHandler } from "./middleware/errorMiddleware.js"

const app = express()

app.use(cors())
app.use(express.json())

app.use("/uploads", express.static(path.resolve("uploads")))

app.get("/", (req, res) => {
  res.send("ApnaRent API v1.1 running 🚀")
})

app.use("/api/auth",       authRoutes)
app.use("/api/properties", propertyRoutes)
app.use("/api/rentals",    rentalRoutes)
app.use("/api/admin",      adminRoutes)
app.use("/api/search",     searchRoutes)
app.use("/api/contact",    contactRoutes)
app.use("/api/interests",  interestRoutes)
app.use("/api/amenities",  amenityRoutes)

app.use(notFound)
app.use(errorHandler)

const PORT = process.env.PORT || 5001

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})
