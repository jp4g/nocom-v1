1. price service
  * fetching prices from like coinmarketcap or some free tier data provider every 30 seconds
  * stores previously set price in contract
  * if price moves beyond .5%, update contract
  * if price not updated for 30 minutes, update contract
  * public api available for other services to query for current price (should allow queries of up to 30 different assets at once)
  * if price is updated, notifies liquidation engine to perform new check (should have an API key or some authentication scheme to ensure only the price service can pass through the liquidation engine endpoint)
2. Note monitoring service
  * 1. api endpoint to handshake with a new escrow
  * 2. every minute, run sync_private_state() then check for new notes (should iterate through list)
  * 3. if note is updated, store the value escrow account => collateral/ debt position (and pool)
  * 4. should also store a view to look up escrows by collateral (with api to access this including pagination)
  todo: maybe make this emit constrained events so scanning is easier?
  * should not have its own 
3. Liquidation engine
  * API endpoint for price service to notify that the price of a certain asset has updated - there should be some sort of a
  * When price service notifies of a specific asset updating, should look up all debt positions that have the updated asset as collateral
  * Should each position and build a list of any liquidatable positions
  * Should calculate with interest the 50% max liquidatable value
  * Should dispatch a liquidation to the chain once all necessary data is built
  * todo later (NOT NOW): if multiple liquidations possible at same time, should be able to multi-call them
  * todo later: should handle price oracle making multiple http requests in a short span and enqueue pxe requests
  * should not have its own PXE, rather it should connect to a PXE url supplied in env
4. Docker
  * price service should have the public api available to connect to
  * price service should be able to post requests to liquidation engine

