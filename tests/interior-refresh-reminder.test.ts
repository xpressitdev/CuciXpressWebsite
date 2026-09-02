import { describe, expect, it } from "vitest";
import { buildInteriorRefreshReminderEmail } from "../server/email";

describe("Interior Refresh reminder email", () => {
  it("formats the appointment in Brunei time with all required details", () => {
    const message = buildInteriorRefreshReminderEmail({
      customerEmail: "customer@example.com",
      customerName: "Aisyah",
      branchName: "Tungku Link",
      vehicle: "B1234 · Toyota · Vios",
      slotStart: new Date("2026-09-03T02:15:00.000Z"),
    });

    expect(message.subject).toContain("Tungku");
    expect(message.text).toContain("Thursday, 3 September 2026");
    expect(message.text).toContain("10:15 (Brunei time)");
    expect(message.text).toContain("Tungku Link");
    expect(message.text).toContain("B1234 · Toyota · Vios");
  });

  it("escapes customer and vehicle data in the HTML version", () => {
    const message = buildInteriorRefreshReminderEmail({
      customerEmail: "customer@example.com",
      customerName: "<Aisyah>",
      branchName: "Tungku & Link",
      vehicle: "B1234 <script>",
      slotStart: new Date("2026-09-03T02:15:00.000Z"),
    });

    expect(message.html).toContain("Hi &lt;Aisyah&gt;");
    expect(message.html).toContain("Tungku &amp; Link");
    expect(message.html).toContain("B1234 &lt;script&gt;");
    expect(message.html).not.toContain("<script>");
  });
});