import "dotenv/config"
import express from "express"
import cors from "cors"
import path from "path"

import propertyRoutes from "./routes/propertyRoutes.js"
import authRoutes from "./routes/authRoutes.js"
import { notFound, errorHandler } from "./middleware/errorMiddleware.js"

const app = express()

app.use(cors())
app.use(express.json())

app.use("/uploads", express.static(path.resolve("uploads")))

app.get("/", (req, res) => {
  res.send("ApnaRent API running 🚀")
})

app.use("/api/properties", propertyRoutes)
app.use("/api/admin", authRoutes)

app.use(notFound)
app.use(errorHandler)

const PORT = process.env.PORT || 5000

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})
