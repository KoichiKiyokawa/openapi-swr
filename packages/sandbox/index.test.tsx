import createHooks from "@kiyoshiro/openapi-swr";
import { renderHook, waitFor } from "@testing-library/react";
import {
	afterAll,
	afterEach,
	beforeAll,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import camelcaseKeys from "camelcase-keys";
import { http, HttpResponse } from "msw";
import createClient from "openapi-fetch";
import type { paths } from "./types/__generated";
import { SWRConfig } from "swr";
import { setupServer } from "msw/node";
import { sleep } from "./test-util";

const server = setupServer();

// モックサーバーを開始・停止
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const BASE_URL = "http://localhost:3000";
const client = createClient<paths>({ baseUrl: BASE_URL });
const { useQuery, useQueryInfinite, useMutation } = createHooks(client);

function Main() {
	const mutation = useMutation("post", "/users", {});
	mutation.trigger({ body: {} });
}

const cache = new Map();
afterEach(() => {
	cache.clear();
});

const renderHookWithDisableCache = <T,>(fn: () => T) =>
	renderHook(fn, {
		wrapper: ({ children }) => (
			<SWRConfig value={{ provider: () => cache }}>{children}</SWRConfig>
		),
	});

describe("useQuery", () => {
	it("with success response", async () => {
		const requestUrlSpy = vi.fn();
		server.use(
			http.get("**/users", ({ request }) => {
				requestUrlSpy(request.url);
				return HttpResponse.json([{ id: 1, first_name: "John" }]);
			}),
		);

		const { result, rerender } = renderHookWithDisableCache(() =>
			useQuery("get", "/users", {
				params: { query: { page: 0, per: 10 } },
				mapResponseData: camelcaseKeys,
				tags: ["users"],
			}),
		);

		await waitFor(() =>
			expect(result.current.data).toStrictEqual([{ id: 1, firstName: "John" }]),
		);
		expect(requestUrlSpy).toHaveBeenCalledTimes(1);
		expect(requestUrlSpy).toHaveBeenCalledWith(
			`${BASE_URL}/users?page=0&per=10`,
		);

		// should hit cache
		rerender();
		await sleep(100);
		expect(requestUrlSpy).toHaveBeenCalledTimes(1);

		// should not hit cache
		renderHookWithDisableCache(() =>
			useQuery("get", "/users", {
				params: { query: { page: 1, per: 10 } },
				mapResponseData: camelcaseKeys,
				tags: ["users"],
			}),
		);
		await waitFor(() =>
			expect(requestUrlSpy).toBeCalledWith(`${BASE_URL}/users?page=1&per=10`),
		);
		expect(requestUrlSpy).toHaveBeenCalledTimes(2);
	});

	it("with error response", async () => {
		server.use(
			http.get("**/users", () => {
				return HttpResponse.json({ error_detail: "foo" }, { status: 500 });
			}),
		);

		const { result } = renderHookWithDisableCache(() =>
			useQuery("get", "/users", {
				params: { query: { page: 0, per: 10 } },
				mapResponseError: camelcaseKeys,
				tags: ["users"],
			}),
		);

		await waitFor(() =>
			expect(result.current.error).toStrictEqual({ errorDetail: "foo" }),
		);
	});
});

describe("useQueryInfinite", () => {
	it("with success response", async () => {
		const requestUrlSpy = vi.fn();
		server.use(
			http.get("**/users", ({ request }) => {
				requestUrlSpy(request.url);
				const page = Number(new URL(request.url).searchParams.get("page"));
				return HttpResponse.json([{ id: page + 1, first_name: "John" }]);
			}),
		);

		const { result, rerender } = renderHookWithDisableCache(() =>
			useQueryInfinite(
				"get",
				"/users",
				{
					getParams(pageIndex, _previousPageData) {
						return { query: { per: 10, page: pageIndex } };
					},
					mapResponseData: camelcaseKeys,
				},
				{ revalidateFirstPage: false },
			),
		);

		await waitFor(() =>
			expect(result.current.data).toStrictEqual([
				[{ id: 1, firstName: "John" }],
			]),
		);
		expect(requestUrlSpy).toHaveBeenCalledTimes(1);
		expect(requestUrlSpy).toHaveBeenCalledWith(
			`${BASE_URL}/users?per=10&page=0`,
		);

		// should hit cache
		rerender();
		await sleep(100);
		expect(requestUrlSpy).toHaveBeenCalledTimes(1);

		// should not hit cache
		await waitFor(() => {
			result.current.setSize((p) => p + 1);
		});
		await waitFor(() =>
			expect(requestUrlSpy).toBeCalledWith(`${BASE_URL}/users?per=10&page=0`),
		);
		expect(requestUrlSpy).toHaveBeenCalledTimes(2);
	});

	it("with error response", async () => {
		server.use(
			http.get("**/users", () => {
				return HttpResponse.json({ error_detail: "foo" }, { status: 500 });
			}),
		);

		const { result } = renderHookWithDisableCache(() =>
			useQueryInfinite("get", "/users", {
				getParams(pageIndex, _previousPageData) {
					return { query: { per: 10, page: pageIndex } };
				},
				mapResponseError: camelcaseKeys,
			}),
		);

		await waitFor(() =>
			expect(result.current.error).toStrictEqual({ errorDetail: "foo" }),
		);
	});
});

describe("useMutation", () => {
	it("with success response", async () => {
		const requestUrlSpy = vi.fn();
		server.use(
			http.post("**/users", ({ request }) => {
				requestUrlSpy(request.url);
				return HttpResponse.json({ id: 1, first_name: "John" });
			}),
		);

		const { result } = renderHookWithDisableCache(() =>
			useMutation("post", "/users", { mapResponseData: camelcaseKeys }),
		);

		await waitFor(async () =>
			expect(await result.current.trigger({ body: {} })).toStrictEqual({
				id: 1,
				firstName: "John",
			}),
		);
		expect(requestUrlSpy).toHaveBeenCalledTimes(1);
		expect(requestUrlSpy).toHaveBeenCalledWith(`${BASE_URL}/users`);
	});

	it("with error response", async () => {
		server.use(
			http.post("**/users", () => {
				return HttpResponse.json({ error_detail: "foo" }, { status: 500 });
			}),
		);

		const { result } = renderHookWithDisableCache(() =>
			useMutation("post", "/users", {}),
		);

		await waitFor(async () =>
			expect(await result.current.trigger({ body: {} })).toStrictEqual({
				errorDetail: "foo",
			}),
		);
	});
});
