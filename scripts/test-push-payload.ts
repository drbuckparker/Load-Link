// Focused validation for push payloads: every Expo push message must carry an
// explicit iOS sound (omitting it = silent delivery) plus an interruption
// level, channelId, and high priority. Run with: npx tsx scripts/test-push-payload.ts
import { buildExpoPushMessage } from "../server/push-payload";

let failures = 0;
function check(name: string, cond: boolean) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.error(`FAIL  ${name}`); }
}

// 1. Default message (general notifications like job applications).
const m1 = buildExpoPushMessage({ to: "ExponentPushToken[x]", title: "T", body: "B" });
check("default sound is 'default' (never omitted)", m1.sound === "default");
check("default interruptionLevel is 'active'", m1.interruptionLevel === "active");
check("default channelId is 'default'", m1.channelId === "default");
check("priority is 'high'", m1.priority === "high");
check("data defaults to {}", typeof m1.data === "object" && m1.data !== null);

// 2. New-job truck-horn message.
const m2 = buildExpoPushMessage({
  to: "ExponentPushToken[y]", title: "T", body: "B",
  sound: "truckhorn.wav", channelId: "job-alerts", interruptionLevel: "timeSensitive",
  data: { type: "new_job", jobId: "1" },
});
check("custom sound preserved", m2.sound === "truckhorn.wav");
check("job-alerts channel preserved", m2.channelId === "job-alerts");
check("timeSensitive preserved", m2.interruptionLevel === "timeSensitive");

// 3. Degenerate sound values must fall back to 'default', never silent.
check("empty sound falls back to 'default'", buildExpoPushMessage({ to: "t", title: "T", body: "B", sound: "" }).sound === "default");
check("whitespace sound falls back to 'default'", buildExpoPushMessage({ to: "t", title: "T", body: "B", sound: "  " }).sound === "default");
check("undefined sound falls back to 'default'", buildExpoPushMessage({ to: "t", title: "T", body: "B", sound: undefined }).sound === "default");

if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
console.log("\nAll push payload checks passed");
