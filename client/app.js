fetch('/id').then(resp => resp.json())
  .then(data => {
    const script = document.createElement('script');
    script.src = `https://www.paypal.com/sdk/js?client-id=${data.id}&components=buttons&enable-funding=venmo,paylater`;
    script.onload = function () {
      window.paypal.Buttons({
        style: {
          shape: 'pill',
          layout: 'vertical', //default value. Can be changed to horizontal
        },
        async createOrder() {
          try {
            const response = await fetch("/api/orders", {
              method: "POST",
              headers: { "Content-Type": "application/json" }
            });
            const orderData = await response.json();
            if (orderData.id) return orderData.id;
            else {
              const errorDetail = orderData?.details?.[0];
              const errorMessage = errorDetail
                ? `${errorDetail.issue} ${errorDetail.description} (${orderData.debug_id})`
                : JSON.stringify(orderData);
              throw new Error(errorMessage);
            }
          } catch (error) {
            console.error(error);
            resultMessage(`Could not initiate PayPal Checkout...<br><br>${error}`);
          }
        },
        async onApprove(data, actions) {
          try {
            const response = await fetch(`/api/orders/${data.orderID}/capture`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
            });
            console.log('loc', window.location.origin);
            const orderData = await response.json();
            // Three cases to handle:
            //   (1) Recoverable INSTRUMENT_DECLINED -> call actions.restart()
            //   (2) Other non-recoverable errors -> Show a failure message
            //   (3) Successful transaction -> Show confirmation or thank you message

            const errorDetail = orderData?.details?.[0];

            if (errorDetail?.issue === "INSTRUMENT_DECLINED") {
              // (1) Recoverable INSTRUMENT_DECLINED -> call actions.restart()
              // recoverable state, per https://developer.paypal.com/docs/checkout/standard/customize/handle-funding-failures/
              return actions.restart();
            } else if (errorDetail) {
              // (2) Other non-recoverable errors -> Show a failure message
              throw new Error(`${errorDetail.description} (${orderData.debug_id})`);
            } else if (!orderData.purchase_units) {
              throw new Error(JSON.stringify(orderData));
            } else {
              // (3) Successful transaction -> Show confirmation or thank you message
              // Or go to another URL:  actions.redirect('thank_you.html');
              actions.redirect(`${window.location.origin}/paid.html`);
              console.log('should redirect');
              const transaction =
                orderData?.purchase_units?.[0]?.payments?.captures?.[0] ||
                orderData?.purchase_units?.[0]?.payments?.authorizations?.[0];
              resultMessage(transaction.status);
            }
          } catch (error) { console.error(error); }
        }
      })
        .render("#paypal-button-container");
    }
    document.body.appendChild(script);
  });

function resultMessage(message) {
  console.log('result msg:' + message);
}

