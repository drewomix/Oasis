// SearchTool.ts

import { StructuredTool } from '@langchain/core/tools';
import { SerpAPI } from '@langchain/community/tools/serpapi';
import { z } from 'zod';

export const SERPAPI_API_KEY = process.env.SERPAPI_API_KEY || "";

// Define the input schema using zod
const SearchInputSchema = z.object({
  searchKeyword: z.string().describe('The search query or keywords to search for'),
  includeImage: z.boolean().optional().describe('Whether to include image results (optional, defaults to false)'),
});

// Type for the search input based on the schema
type SearchInput = z.infer<typeof SearchInputSchema>;

/**
 * SearchToolForAgents is a LangChain StructuredTool class that searches for additional information
 * about an entity using SerpAPI.
 *
 * Input: {
 *   "searchKeyword": "your search query",
 *   "includeImage": false  // optional, defaults to false
 * }
 *
 * The tool returns a JSON string with the search result details.
 */
export class SearchToolForAgents extends StructuredTool {
  name = 'Search_Engine';
  description = 'Searches the web for information about a given query. Input: { "searchKeyword": string, "includeImage"?: boolean }. Pass specific queries and/or keywords to quickly search the WWW to retrieve information on any topic like academic research, history, entertainment, current events. This tool does NOT work for personal information and does NOT work for math.';
  schema = SearchInputSchema;
  private serpApi: SerpAPI;

  constructor() {
    super();
    this.serpApi = new SerpAPI(SERPAPI_API_KEY!);
  }

  /**
   * The main method to run the tool.
   * @param input - Object with searchKeyword and optionally includeImage
   * @returns A JSON string with search result details
   */
  async _call(input: SearchInput): Promise<string> {
    const { searchKeyword, includeImage = false } = input;

    // Validate that searchKeyword is not empty
    if (!searchKeyword || searchKeyword.trim() === '') {
      return JSON.stringify({
        error: 'Search keyword cannot be empty. Please provide a valid search query.',
      });
    }

    try {
      // Invoke the SerpAPI call with the search query.
      const searchUrl = `https://serpapi.com/search?q=${encodeURIComponent(searchKeyword)}&engine=google&api_key=${SERPAPI_API_KEY}&hl=en&gl=us`;
      await new Promise(resolve => setTimeout(resolve, 200));
      const response = await fetch(searchUrl);
      const result = await response.json();

      // Log the raw results if needed.
      // console.log("$$$$$ SearchToolForAgents Result:", JSON.stringify(result));

      // Format the results using the helper function.
      const formattedOutput = this.formatSearchResults(result);
      // console.log("Formatted Search Results:\n", formattedOutput);

      // Return the formatted result as a JSON string.
      return JSON.stringify({ result: formattedOutput });
    } catch (error) {
      console.error(`Error during search for "${searchKeyword}":`, error);
      return JSON.stringify({
        url: `https://www.google.com/search?q=${encodeURIComponent(searchKeyword)}`,
        snippet: `Error occurred while searching for ${searchKeyword}.`,
      });
    }
  }

  /**
   * Formats the raw SerpAPI results into a readable string format
   * @param result - Raw SerpAPI response object
   * @returns Formatted search results as a string
   */
  private formatSearchResults(result: any): string {
    const formattedLines: string[] = [];

    // Format organic results
    const organicResults = result.organic_results || [];
    organicResults.forEach((entry: any) => {
      const title = entry.title?.trim() || "No Title";
      const source = entry.source?.trim() || "No Source";
      const snippet = entry.snippet?.trim() || "No Snippet";
      formattedLines.push(`Title: ${title}\nSource: ${source}\nSnippet: ${snippet}`);
    });

    // Format knowledge graph if available
    if (result.knowledge_graph) {
      const kg = result.knowledge_graph;
      const kgTitle = kg.title || "No Title";
      const kgType = kg.type;
      // If an entity type exists, add it as a line.
      if (kgType) {
        formattedLines.push(`${kgTitle}: ${kgType}.`);
      }
      // Add the knowledge graph description.
      const kgDescription = kg.description;
      if (kgDescription) {
        formattedLines.push(kgDescription);
      }
      // Process any attributes in the knowledge graph.
      if (kg.attributes) {
        for (const attribute in kg.attributes) {
          if (kg.attributes.hasOwnProperty(attribute)) {
            const value = kg.attributes[attribute];
            formattedLines.push(`${kgTitle} ${attribute}: ${value}.`);
          }
        }
      }
    }

    // console.log("Formatted Lines:", formattedLines);

    // Join all entries with an extra newline between them
    return formattedLines.join("\n");
  }
}
