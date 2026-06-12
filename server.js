import "dotenv/config";
import express from "express";
import cors from "cors";

import authRoutes from "./routes/auth/authRoutes.js";
import rentalRoutes from "./routes/rentals/rentalRoutes.js";
import propertyRoutes from "./routes/properties/propertyRoutes.js";
import adminRoutes from "./routes/admin/adminRoutes.js";
import searchRoutes from "./routes/search/searchRoutes.js";
import contactRoutes from "./routes/contacts/contactRoutes.js";
import interestRoutes from "./routes/interests/interestRoutes.js";
import amenityRoutes from "./routes/amenities/amenityRoutes.js";
import { notFound, errorHandler } from "./middleware/errorMiddleware.js";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("ApnaRent API v1.1 running 🚀");
});

app.use("/api/auth", authRoutes);
app.use("/api/rentals", rentalRoutes);
app.use("/api/properties", propertyRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/interests", interestRoutes);
app.use("/api/amenities", amenityRoutes);

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5001;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
