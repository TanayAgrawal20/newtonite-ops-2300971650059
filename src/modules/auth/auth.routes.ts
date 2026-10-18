
import { Router } from "express";
import { loginUser } from "./auth.service";

const router = Router();

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body ?? {};

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      !email.trim() ||
      !password
    ) {
      res.status(400).json({
        success: false,
        message: "Email and password are required.",
      });
      return;
    }

    const result = await loginUser({ email, password });

    if (!result) {
      res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Login failed:", error);

    res.status(500).json({
      success: false,
      message: "Unable to complete login.",
    });
  }
});

export default router;
