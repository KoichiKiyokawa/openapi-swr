import type { Client, FetchOptions, FetchResponse } from "openapi-fetch";
import type {
	HttpMethod,
	MediaType,
	PathsWithMethod,
} from "openapi-typescript-helpers";
import useSWR, { type SWRConfiguration } from "swr";
import useSWRInfinite, { type SWRInfiniteConfiguration } from "swr/infinite";
import useSWRMutation, { type SWRMutationConfiguration } from "swr/mutation";

// biome-ignore lint/complexity/noBannedTypes: OK in library code
type AnyOptions = {};

export type SuccessResponseByMethodAndPath<
	Paths extends Record<string, any>,
	Method extends HttpMethod,
	Path extends PathsWithMethod<Paths, Method>,
> = Extract<
	FetchResponse<Paths[Path][Method], AnyOptions, MediaType>,
	{ data: unknown }
>["data"];

export type ErrorResponseByMethodAndPath<
	Paths extends Record<string, any>,
	Method extends HttpMethod,
	Path extends PathsWithMethod<Paths, Method>,
> = Extract<
	FetchResponse<Paths[Path][Method], AnyOptions, MediaType>,
	{ error: unknown }
>["error"];

export default function createHooks<
	Paths extends Record<string, any>,
	Media extends MediaType,
>(client: Client<Paths, Media>) {
	function useQuery<
		Method extends HttpMethod,
		Path extends PathsWithMethod<Paths, Method>,
		Data extends SuccessResponseByMethodAndPath<Paths, Method, Path>,
		Error extends ErrorResponseByMethodAndPath<Paths, Method, Path>,
		MappedData extends Data,
		MappedError extends Error,
	>(
		method: Method,
		url: Path,
		{
			pause = false,
			tags,
			mapResponseData = (d) => d,
			mapResponseError = (e) => e,
			...options
		}: FetchOptions<Paths[Path][Method]> & {
			pause?: boolean;
			tags?: string[];
			mapResponseData?: (data: Data) => MappedData;
			mapResponseError?: (err: Error) => MappedError;
		},
		config?: SWRConfiguration<Data, Error>,
	) {
		return useSWR<MappedData, MappedError>(
			pause ? null : { method, url, params: options.params, tags },
			() =>
				client.request(method, url, options as any).then((res) => {
					if (res.error) throw mapResponseError(res.error);
					return mapResponseData(res.data);
				}),
			config,
		);
	}

	function useQueryInfinite<
		Method extends HttpMethod,
		Path extends PathsWithMethod<Paths, Method>,
		Data extends SuccessResponseByMethodAndPath<Paths, Method, Path>,
		Error extends ErrorResponseByMethodAndPath<Paths, Method, Path>,
		MappedData extends Data,
		MappedError extends Error,
	>(
		method: Method,
		url: Path,
		{
			pause = false,
			getParams,
			tags,
			mapResponseData = (d) => d,
			mapResponseError = (e) => e,
			...options
		}: Omit<FetchOptions<Paths[Path][Method]>, "params"> & {
			getParams: (
				pageIndex: number,
				previousPageData: Data | null,
			) => FetchOptions<Paths[Path][Method]>["params"];
			pause?: boolean;
			tags?: string[];
			mapResponseData?: (data: Data) => MappedData;
			mapResponseError?: (err: Error) => MappedError;
		},
		config?: SWRInfiniteConfiguration<Data, Error>,
	) {
		return useSWRInfinite<MappedData, MappedError>(
			(pageIndex, previousPageData) => {
				if (pause) return null;
				if (Array.isArray(previousPageData) && previousPageData.length === 0)
					return null;

				return {
					method,
					url,
					params: getParams(pageIndex, previousPageData),
					tags,
				};
			},
			({ method, url, params }) =>
				client
					.request(method, url, { ...options, params } as any)
					.then((res) => {
						if (res.error) throw mapResponseError(res.error);
						return mapResponseData(res.data);
					}),
			config,
		);
	}

	function useMutation<
		Method extends HttpMethod,
		Path extends PathsWithMethod<Paths, Method>,
		Data extends SuccessResponseByMethodAndPath<Paths, Method, Path>,
		Error extends ErrorResponseByMethodAndPath<Paths, Method, Path>,
		MappedData extends Data,
		MappedError extends Error,
		Key extends { method: Method; url: Path; tags?: string[] },
	>(
		method: Method,
		url: Path,
		{
			tags,
			mapResponseData = (d) => d,
			mapResponseError = (e) => e,
		}: {
			tags?: string[];
			mapResponseData?: (data: Data) => MappedData;
			mapResponseError?: (err: Error) => MappedError;
		},
		config?: SWRMutationConfiguration<MappedData, MappedError, Key>,
	) {
		return useSWRMutation<
			MappedData,
			MappedError,
			{ method: Method; url: Path; tags?: string[] },
			FetchOptions<Paths[Path][Method]>
		>(
			{ method, url, tags },
			(_, { arg }) =>
				client.request(method, url, arg as any).then((res) => {
					if (res.error) throw mapResponseError(res.error);
					return mapResponseData(res.data);
				}),
			config,
		);
	}

	return { useQuery, useQueryInfinite, useMutation };
}
