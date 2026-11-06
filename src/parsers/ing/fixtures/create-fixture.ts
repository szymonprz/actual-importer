// Helper script to create a CP1250-encoded ING fixture
// Run with: npx tsx src/parsers/ing/fixtures/create-fixture.ts
import * as iconv from "iconv-lite";
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const content = `"Lista transakcji";;;;;"ING Bank Śląski S.A.";;;;;;;;;;;;;;;
"Dokument nr 999";
"Wygenerowany dnia: 2026-04-06";;;;;;;;;;;;;;;;;;;;

"Dane Użytkownika:";
"JAN TESTOWY";

"Wybrane rachunki:";
"KONTO Direct (PLN)";;"11 0000 2222 3333 4444 5555 6666";

"Zastosowane kryteria wyboru";;;;;"Podsumowanie";;

"Zakres dat:";"2026-01-01 - 2026-04-06";"Typy transakcji:";"wszystkie";;"Liczba transakcji:";5;

;;;;;"Suma uznań (2):";1500,00;PLN;;;;;;;;;;;;;

;;;;;"Suma obciążeń (3):";200,00;PLN;;;;;;;;;;;;;

"Data transakcji";"Data księgowania";"Dane kontrahenta";"Tytuł";"Nr rachunku";"Nazwa banku";"Szczegóły";"Nr transakcji";"Kwota transakcji (waluta rachunku)";"Waluta";"Kwota blokady/zwolnienie blokady";"Waluta";"Kwota płatności w walucie";"Waluta";"Saldo po transakcji";"Waluta";;;;;
2026-04-01;2026-04-01;" Sklep Testowy ";" Zakupy spożywcze";'22000033334444555566667777 ';"ING Bank Śląski S.A.";"TR.KART  ";'100000000000000001';-45,50;PLN;;;;;5000,00;PLN;;;;;
2026-04-02;2026-04-02;" Anna Przykładowa ";" Przelew za obiad";'33000044445555666677778888 ';"Santander Bank Polska S.A";"PRZELEW  ";'100000000000000002';-100,00;PLN;;;;;4900,00;PLN;;;;;
2026-04-03;2026-04-03;" Firma Przykład Sp. z o.o. ";" Wynagrodzenie marzec 2026";;;"PRZELEW  ";'100000000000000003';1500,00;PLN;;;;;6400,00;PLN;;;;;
2026-04-04;2026-04-04;" JAN TESTOWY ";" Przelew własny";'99000011112222333344445555 ';"Santander Bank Polska S.A.";"PRZELEW  ";'100000000000000004';-7000,00;PLN;;;;;-600,00;PLN;;;;;
2026-04-05;2026-04-05;" Serwis Streamingowy ";" Płatność kartą 05.04.2026";;;"TR.KART  ";'100000000000000005';-54,50;PLN;;;;;-654,50;PLN;;;;;


"Dokument ma charakter informacyjny, nie stanowi dowodu księgowego";
`;

const encoded = iconv.encode(content, "cp1250");
writeFileSync(join(__dirname, "sample.csv"), encoded);
console.log("Created ing-sample.csv");
