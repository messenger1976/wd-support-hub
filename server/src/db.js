import mysql from 'mysql2/promise';
import { config } from './config.js';

export const pool = mysql.createPool({
	...config.db,
	// Tables are utf8 (utf8mb3); match the PHP hub's set_charset('utf8').
	charset: 'UTF8_GENERAL_CI',
	// Keep DATETIME as the 'Y-m-d H:i:s' strings the WD apps compare against.
	dateStrings: true,
	waitForConnections: true,
	connectionLimit: 10,
});

export async function query(sql, params = []) {
	const [rows] = await pool.query(sql, params);
	return rows;
}

export async function one(sql, params = []) {
	const rows = await query(sql, params);
	return rows[0] || null;
}
