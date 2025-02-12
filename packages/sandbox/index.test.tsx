import createHooks from "@kiyoshiro/openapi-swr";
import camelcaseKeys from "camelcase-keys";
import createClient from "openapi-fetch";
import type { paths } from "./types/__generated";

const client = createClient<paths>();
const { useQuery, useQueryInfinite, useMutation } = createHooks(client);

function Main() {
	const queryResult = useQuery("get", "/users", {
		params: { query: { page: 0, per: 10 } },
		mapResponseData: camelcaseKeys,
		tags: ["users"],
	});

	const queryInfiniteResult = useQueryInfinite("get", "/users", {
		getParams(pageIndex, _previousPageData) {
			return { query: { per: 10, page: pageIndex } };
		},
		mapResponseData: camelcaseKeys,
	});

	const mutation = useMutation("post", "/users", {});
	mutation.trigger({ body: {} });
}
