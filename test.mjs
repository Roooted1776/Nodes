import * as archil from "disk";

archil.configure({
  apiKey: process.env.ARCHIL_API_KEY,
  region: process.env.ARCHIL_REGION,
});

const disk = await archil.getDisk("dsk-000000000011bc55");

const result = await disk.exec("ls -la /mnt/archil");

console.log("Exit code:", result.exitCode);
console.log("Output:", result.stdout);
console.log("Errors:", result.stderr);
