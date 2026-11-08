/**
 * Connector Registry
 * Central registry of all active connectors
 */

import { Connector } from './interface';
import { GoogleSheetsConnector } from './google-sheets';
import { AirtableConnector } from './airtable';
import { NotionConnector } from './notion';
import { HubSpotConnector } from './hubspot';
import { CsvConnector } from './csv';
import { MockConnector } from './mock';

export const connectorRegistry: Record<string, Connector> = {
  google_sheets: GoogleSheetsConnector,
  airtable: AirtableConnector,
  notion: NotionConnector,
  hubspot: HubSpotConnector,
  csv: CsvConnector,
  mock_db: MockConnector
};

export function getConnector(id: string): Connector {
  const connector = connectorRegistry[id];
  if (!connector) {
    throw new Error(`Connector '${id}' not found in registry.`);
  }
  return connector;
}

export function getAllConnectors(): Connector[] {
  return Object.values(connectorRegistry);
}
