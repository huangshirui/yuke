export default {
  async fetch(request: Request): Promise<Response> {
    return new Response(JSON.stringify({
      name: "Yu言在线 API",
      status: "ok"
    }), {
      headers: {
        "content-type": "application/json;charset=UTF-8"
      }
    });
  }
};
