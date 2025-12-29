fetch('/id').then(resp => resp.json())
    .then(data => {
        const params = new URLSearchParams(window.location.search);
        const locale = params.get('locale');
        const script = document.createElement('script');
        // Pass the locale to PayPal SDK. Default to en_US if missing.
        // Note: If PayPal doesn't support the specific locale (e.g. some obscure format), it usually falls back safely.
        script.src = `https://www.paypal.com/sdk/js?client-id=${data.id}&components=buttons&enable-funding=venmo,paylater`;
        script.onload = function () {
            window.paypal.Buttons({
                style: {
                    shape: 'pill',
                    layout: 'vertical',
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
                        const errorDetail = orderData?.details?.[0];

                        if (errorDetail?.issue === "INSTRUMENT_DECLINED") {
                            return actions.restart();
                        } else if (errorDetail) {
                            throw new Error(`${errorDetail.description} (${orderData.debug_id})`);
                        } else if (!orderData.purchase_units) {
                            throw new Error(JSON.stringify(orderData));
                        } else {
                            actions.redirect(`${window.location.origin}/paid`);
                            console.log('should redirect');
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
