"use client";

import { createCorsairReactClient } from "corsair/client/react";

export const { useConnectionStatus, useCreateConnectLink } = createCorsairReactClient({
  baseURL: "/api/corsair",
});
