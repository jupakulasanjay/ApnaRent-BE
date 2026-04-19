import "dotenv/config"
import express from "express"
import cors from "cors"
import path from "path"

import authRoutes from "./routes/authRoutes.js"
import propertyRoutes from "./routes/propertyRoutes.js"
import meRoutes from "./routes/meRoutes.js"
import adminRoutes from "./routes/adminRoutes.js"
import { notFound, errorHandler } from "./middleware/errorMiddleware.js"

const app = express()

app.use(cors())
app.use(express.json())

app.use("/uploads", express.static(path.resolve("uploads")))

app.get("/", (req, res) => {
  res.send("ApnaRent API running 🚀")
})

app.use("/api/auth", authRoutes)
app.use("/api/properties", propertyRoutes)
app.use("/api/me", meRoutes)
app.use("/api/admin", adminRoutes)

app.use(notFound)
app.use(errorHandler)

const PORT = process.env.PORT || 5001

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})
