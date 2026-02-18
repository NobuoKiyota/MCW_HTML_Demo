import { _decorator } from 'cc';

export class CSVHelper {
    /**
     * Parse CSV text into an array of objects.
     * Assumes the first row is the header.
     * @param csvText 
     */
    public static parse(csvText: string): any[] {
        const lines = csvText.split(/\r\n|\n/);
        const result: any[] = [];

        if (lines.length < 2) return result;

        const headers = lines[0].split(',');

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line === "" || line.startsWith("#") || line.startsWith("//")) continue;

            const values = line.split(',');
            if (values.length !== headers.length) {
                // Handle split error or commas in quotes (simple split doesn't handle specs)
                // For now, assume simple CSV without internal commas
                console.warn(`[CSVHelper] Row ${i} skipped. Value count mismatch.`);
                continue;
            }

            const obj: any = {};
            for (let j = 0; j < headers.length; j++) {
                const key = headers[j].trim();
                let val: string | number | boolean = values[j].trim();

                // Type conversion guess
                if (!isNaN(Number(val)) && val !== "") {
                    val = Number(val);
                } else if (val.toLowerCase() === "true") {
                    val = true;
                } else if (val.toLowerCase() === "false") {
                    val = false;
                }

                obj[key] = val;
            }
            result.push(obj);
        }
        return result;
    }
}
