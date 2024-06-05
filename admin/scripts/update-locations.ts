import type { Location } from "~/models/clock-config";

import admin from "firebase-admin";
import { getDatabase } from "firebase-admin/database";

const [key, dbName] = process.argv.slice(2);
if (!key || !dbName) {
	console.log(
		"Usage: npx tsx scripts/update-locations.ts ../service-account-key-staging.json vikes-match-clock-staging",
	);
}
(async () => {
	const certValue = await import(`${process.cwd()}/${key}`);

	const app = admin.initializeApp({
		credential: admin.credential.cert(certValue),
		// The database URL depends on the location of the database
		databaseURL: `https://${dbName}.firebaseio.com`,
	});

	// Get a database reference to our blog
	const db = getDatabase();
	const ref = db.ref("locations");

	const locationConfig: { [key: string]: Location } = {
		vikinni: {
			label: "Víkin inni",
			pitchIds: [102],
			config: {},
			screens: [
				{
					name: "Stóri",
					key: "insidebig",
					fontSize: "180%",
					style: {
						height: 288,
						width: 448,
					},
				},
				{
					name: "Litli",
					key: "insidesmall",
					fontSize: "130%",
					style: {
						height: 224,
						width: 288,
					},
				},
			],
		},
		vikuti: {
			label: "Víkin úti",
			pitchIds: [102],
			config: {
				homeTeam: 103,
				goalScorerBackground: "config/baddi.gif",
			},
			screens: [
				{
					key: "outside",
					fontSize: "100%",
					name: "Skjár",
					style: {
						height: 176,
						width: 240,
					},
				},
			],
		},
		safamyriuti: {
			label: "Safamýri úti",
			pitchIds: [7602, 8622],
			config: {
				homeTeam: 103,
				goalScorerBackground: "config/baddi.gif",
			},
			screens: [
				{
					key: "outside",
					fontSize: "100%",
					name: "Skjár",
					style: {
						height: 176,
						width: 240,
					},
				},
			],
		},
		hasteinsvollur: {
			label: "Hásteinsvöllur",
			pitchIds: [221],
			config: {},
			screens: [
				{
					key: "ibv",
					fontSize: "290%",
					name: "Skjár",
					style: {
						height: 512,
						width: 640,
					},
				},
			],
		},
	};

	await ref.set(locationConfig);
	await app.delete();
	console.log("done!");
})();
