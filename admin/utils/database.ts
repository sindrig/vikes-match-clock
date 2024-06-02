import { ref as databaseRef, update, type Database } from "firebase/database";

export const stringSetter = (path: string, db: Database) => {
	return (value: string) => {
		update(databaseRef(db), { [path]: value });
	};
};
