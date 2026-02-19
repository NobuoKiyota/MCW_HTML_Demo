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

        if (lines.length < 1) return result;

        let headers: string[] = [];
        let headerLineIndex = -1;
        let delimiter = ",";

        // Find Header
        for (let i = 0; i < lines.length; i++) {
            let line = lines[i].trim();
            if (line === "" || line.startsWith("#") || line.startsWith("//")) continue;

            // Clean up trailing slashes or delimiters (user's "//////")
            line = line.replace(/([\/\,]{2,})$/, "");

            // Detect delimiter
            if (line.includes("/")) delimiter = "/";
            else if (line.includes(";")) delimiter = ";";
            else if (line.includes("\t")) delimiter = "\t";
            else delimiter = ",";

            headers = this.splitLine(line, delimiter);
            headerLineIndex = i;
            break;
        }

        if (headerLineIndex === -1) return result;

        for (let i = headerLineIndex + 1; i < lines.length; i++) {
            let line = lines[i].trim();
            if (line === "" || line.startsWith("#") || line.startsWith("//")) continue;

            // Strip trailing junk
            line = line.replace(/([\/\,]{2,})$/, "");

            const values = this.splitLine(line, delimiter);
            if (values.length < headers.length) {
                // Allow fewer values if trailing ones are empty, but skip if too small
                if (values.length < headers.length - 2) {
                    console.warn(`[CSVHelper] Row ${i} skipped. Value count mismatch.`);
                    continue;
                }
            }

            const obj: any = {};
            for (let j = 0; j < headers.length; j++) {
                let key = headers[j].trim();
                // Clean key (remove non-printable or BOM)
                key = key.replace(/[^\x20-\x7E]/g, "");

                let val: string | number | boolean = (values[j] || "").trim();

                // Remove quotes if present
                if (val.startsWith('"') && val.endsWith('"')) {
                    val = val.substring(1, val.length - 1);
                }

                // Type conversion
                if (!isNaN(Number(val)) && val !== "") {
                    val = Number(val);
                } else if (val.toLowerCase() === "true") {
                    val = true;
                } else if (val.toLowerCase() === "false") {
                    val = false;
                }

                obj[key] = val;
            }
            // console.log(`[CSVHelper] Parsed Row: ${JSON.stringify(obj)}`);
            result.push(obj);
        }
        console.log(`[CSVHelper] Finished parsing CSV. Rows: ${result.length}, Delimiter: [${delimiter}]`);
        // Diagnostic: Log first 10 IDs if this looks like a sound/enemy file
        if (result.length > 0) {
            const keys = Object.keys(result[0]);
            const ids = result.slice(0, 10).map(r => r.ID || r.id || "N/A");
            console.log(`[CSVHelper] Headers: [${keys.join(", ")}], First 10 IDs: [${ids.join(", ")}]`);
        }
        return result;
    }

    /**
     * Splits a line by delimiter, respecting double quotes.
     */
    private static splitLine(line: string, delimiter: string): string[] {
        const result: string[] = [];
        let cur = "";
        let inQuote = false;
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                inQuote = !inQuote;
                cur += char; // Keep quote for later stripping
            } else if (char === delimiter && !inQuote) {
                result.push(cur);
                cur = "";
            } else {
                cur += char;
            }
        }
        result.push(cur);
        return result;
    }
}
