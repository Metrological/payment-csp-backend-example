# Metrological Payment Service: Integration Guide for Content Service Providers
Bas van Meurs, Metrological, October 2017

This repository contains an example on how to build/extend an API endpoint for the Metrological Payment Service (MPS). MPS is a MAF service that can be used from a MAF app to offer payed content. For more information on the MAF-side of MPS, refer to the payment example MAF app in the maf-example folder.

Notice that this is just an example of how to use the MPS. For your specific application the API methods, assets and implementation may be different. After studying this example you should be able to understand what needs to be done to support the backend-side of your app for payment.

This example is meant for Content Service Providers (CSPs) and external app builders that already have an agreement with Metrological to build the app.

# General architecture
When a user buys content via your app, the following should happen:
![!sequence diagram](https://github.com/Metrological/payment-csp-backend-example/raw/master/sequence-diagram.png)

In short, your app API endpoint should provide a method to create a ***signed payment object*** for the specific user/asset. The specific fields of this payment object are shown in the example. After the app / MAF / MPS communication has been completed, a ***signed payment receipt*** (basically a proof that the operator has received the information and will invoice it to the customer) is sent back, and you should register that the client may use the asset, and allow it from that moment onwards. For that, you will need another method.

You will also need an endpoint for checking whether the user already has access to the asset, before actually showing a 'buy' option in the app at all (not depicted in the sequence diagram). This is another method that you will need.

# Example
The example has a fixed number of assets (movies) that you can buy. The bought assets will expire automatically after one 24 hours. The example uses Nodejs and Redis for persistent storage because it has very descriptive commands, but you'll probably use another database system. If you like to use the example code as the basis of your own implementation, feel free to do so. But if you do that, Metrological takes no responsibility for it, including (but not limited to) bugs and maintainance.

Our example API endpoint for MPS has the following methods:

```GET /get-asset-status/?assetId=...&household=.... ```
Responds with {"access":"true"}. The 'assetId' is a string, chosen by your service, that identifies the asset itself. Household is our way of identifying the user/settopbox. MPS is just a Payment Service Provider and stores only billing records, not asset information. So your service is responsible for holding the database of bought assets for households. Notice that the MPS does allow the client to buy the same asset multiple times. This allows you to implement assets that expire, for example. |

```GET /get-asset-signature/?household=....&assetId=...```
Responds with the (signed) payment request object for acquiring the specified asset. The example MAF app will call the MAF payment API with this payment object, which will send it to our payment service. The payment service will check the validity (signature) and will create a record in the operator's database. See example code.

```POST /save-asset```
(content-type: application/json, body=signed/payed transaction)
After a payment was inserted successfully in our payment servers, it sends back a signed transaction. Your CSP backend should verify the signature for correctness. If it is not correct it should bail out (this would mean someone is trying to hack the system, or there is a serious bug which blocks payments, so please make sure that you have some error email service running such as log4js to monitor your backend operational status). If it is correct, it should activate the subscription in your database. The signed payment object contains all the fields that you will need. See example code for specifics.

Please consider a test/production endpoint. It may be handy to provide a method on the test endpoint to allow the app developers to clear an asset in your database so that they can test properly.

# Running it
You can run the full example yourself:
1. Use the maf-sdk to run the 'payment example app' as bundled with this document
2. Install the MPS API endpoint example Nodejs (npm install)
3. Make sure that you have Redis installed
4. Run the Nodejs service
5. Navigate to the app in your browser; the Nodejs service should now receive the API calls from the app

# And now?
After you have created a fully working example (both an app and backend), that works in the MAF SDK (https://github.com/Metrological/maf3-sdk), your app should be able to work in production. For putting apps with in-app payments in production, we need to have an agreement with you and the operator(s) involved. Furthermore, we require that your backend service runs on HTTPS for security reasons.
