// mcp-server.js
// ChartsOnBase: Model Context Protocol (MCP) Server for technical chart analysis on Base network

async function main() {
  // Use dynamic imports for ESM packages
  const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js');
  const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
  const { z } = await import('zod');
  
  // Load core Express server logic
  const { 
    PAIRS_DB, 
    getLatestLivePrice, 
    getAIChartAnalysis, 
    fetchCandlesForPair 
  } = require('./server.js');

  const server = new McpServer({
    name: "chartsonbase-mcp",
    version: "1.0.0"
  });

  // Tool 1: list_pairs
  server.tool(
    "list_pairs",
    "List all supported assets for technical chart analysis (crypto, stocks, forex, commodities)",
    {},
    async () => {
      try {
        const pairs = PAIRS_DB.map(p => ({
          symbol: p.symbol,
          name: p.name,
          type: p.type,
          basePrice: p.basePrice
        }));
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify(pairs, null, 2)
          }]
        };
      } catch (err) {
        return {
          isError: true,
          content: [{
            type: "text",
            text: `Failed to list pairs: ${err.message}`
          }]
        };
      }
    }
  );

  // Tool 2: get_pair_price
  server.tool(
    "get_pair_price",
    "Get the current live price of a supported asset (live Binance price for crypto, base price for stocks/forex)",
    {
      symbol: z.string().describe("The asset symbol to fetch, e.g. 'BTC/USDC', 'ETH/USDC', 'TSLA', 'EUR/USD'")
    },
    async ({ symbol }) => {
      try {
        const symbolUpper = symbol.toUpperCase().trim();
        const pair = PAIRS_DB.find(p => p.symbol.toUpperCase() === symbolUpper);
        if (!pair) {
          return {
            isError: true,
            content: [{
              type: "text",
              text: `Asset symbol '${symbol}' not found in supported list. Use list_pairs tool to see available symbols.`
            }]
          };
        }

        const price = await getLatestLivePrice(symbolUpper);
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              symbol: pair.symbol,
              name: pair.name,
              price: price,
              timestamp: new Date().toISOString()
            }, null, 2)
          }]
        };
      } catch (err) {
        return {
          isError: true,
          content: [{
            type: "text",
            text: `Failed to fetch price for ${symbol}: ${err.message}`
          }]
        };
      }
    }
  );

  // Tool 3: analyze_chart
  server.tool(
    "analyze_chart",
    "Analyze technical chart patterns and indicators for a given symbol and timeframe to generate buy/sell signals, entry targets, stop loss, and take profit targets.",
    {
      symbol: z.string().describe("The asset symbol to analyze, e.g. 'BTC/USDC', 'ETH/USDC', 'TSLA'"),
      timeframe: z.enum(["1H", "4H", "1D", "1W"]).optional().default("1H").describe("The candle timeframe to analyze (default: 1H)")
    },
    async ({ symbol, timeframe }) => {
      try {
        const symbolUpper = symbol.toUpperCase().trim();
        const pair = PAIRS_DB.find(p => p.symbol.toUpperCase() === symbolUpper);
        if (!pair) {
          return {
            isError: true,
            content: [{
              type: "text",
              text: `Asset symbol '${symbol}' not found. Use list_pairs tool to see available symbols.`
            }]
          };
        }

        // Fetch recent candles
        console.error(`Fetching candles for ${symbolUpper} (${timeframe})...`);
        const candles = await fetchCandlesForPair(pair, timeframe);
        
        if (!candles || candles.length < 10) {
          return {
            isError: true,
            content: [{
              type: "text",
              text: `Failed to retrieve sufficient chart data for ${symbolUpper}.`
            }]
          };
        }

        console.error(`Running technical analysis on ${candles.length} candles...`);
        const analysis = await getAIChartAnalysis(symbolUpper, candles, timeframe);
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              symbol: symbolUpper,
              timeframe: timeframe,
              analysis: analysis,
              timestamp: new Date().toISOString()
            }, null, 2)
          }]
        };
      } catch (err) {
        return {
          isError: true,
          content: [{
            type: "text",
            text: `Failed to analyze chart for ${symbol}: ${err.message}`
          }]
        };
      }
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("ChartsOnBase MCP Server successfully started on stdio");
}

main().catch(err => {
  console.error("MCP Server startup error:", err);
  process.exit(1);
});
