--
-- PostgreSQL database dump
--

\restrict HZejZ6A2amnPC2KiMadiZejX9hBXqA5AugJ03D3RQxQKzeViIcEPvCJatXrhKP0

-- Dumped from database version 16.12 (9893e46)
-- Dumped by pg_dump version 16.10

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: achievements; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.achievements (
    id integer NOT NULL,
    name text NOT NULL,
    description text NOT NULL,
    required_points integer NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.achievements OWNER TO neondb_owner;

--
-- Name: achievements_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.achievements_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.achievements_id_seq OWNER TO neondb_owner;

--
-- Name: achievements_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.achievements_id_seq OWNED BY public.achievements.id;


--
-- Name: branches; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.branches (
    id integer NOT NULL,
    name text NOT NULL,
    location text NOT NULL,
    queue_count integer DEFAULT 0 NOT NULL,
    google_maps_url text NOT NULL,
    google_maps_embed_url text NOT NULL,
    review_url text NOT NULL,
    last_queue_update timestamp without time zone,
    is_open boolean DEFAULT true NOT NULL
);


ALTER TABLE public.branches OWNER TO neondb_owner;

--
-- Name: branches_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.branches_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.branches_id_seq OWNER TO neondb_owner;

--
-- Name: branches_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.branches_id_seq OWNED BY public.branches.id;


--
-- Name: cars; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.cars (
    id integer NOT NULL,
    user_id integer NOT NULL,
    license_plate character varying(20) NOT NULL,
    brand character varying(100) NOT NULL,
    model character varying(100) NOT NULL,
    type character varying(50) NOT NULL,
    photo_url text
);


ALTER TABLE public.cars OWNER TO neondb_owner;

--
-- Name: cars_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.cars_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.cars_id_seq OWNER TO neondb_owner;

--
-- Name: cars_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.cars_id_seq OWNED BY public.cars.id;


--
-- Name: collaboration_submissions; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.collaboration_submissions (
    id integer NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    phone text,
    business_type text,
    message text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    is_read boolean DEFAULT false NOT NULL
);


ALTER TABLE public.collaboration_submissions OWNER TO neondb_owner;

--
-- Name: collaboration_submissions_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.collaboration_submissions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.collaboration_submissions_id_seq OWNER TO neondb_owner;

--
-- Name: collaboration_submissions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.collaboration_submissions_id_seq OWNED BY public.collaboration_submissions.id;


--
-- Name: service_history; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.service_history (
    id integer NOT NULL,
    user_id integer,
    car_plate text NOT NULL,
    phone text,
    service_type text NOT NULL,
    branch text NOT NULL,
    amount integer NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    queue_position integer,
    payment_reference text,
    transaction_id text,
    check_in_time timestamp without time zone,
    completed_time timestamp without time zone,
    notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.service_history OWNER TO neondb_owner;

--
-- Name: service_history_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.service_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.service_history_id_seq OWNER TO neondb_owner;

--
-- Name: service_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.service_history_id_seq OWNED BY public.service_history.id;


--
-- Name: session; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.session (
    sid character varying NOT NULL,
    sess json NOT NULL,
    expire timestamp(6) without time zone NOT NULL
);


ALTER TABLE public.session OWNER TO neondb_owner;

--
-- Name: subscription_signups; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.subscription_signups (
    id integer NOT NULL,
    email text NOT NULL,
    is_notified boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.subscription_signups OWNER TO neondb_owner;

--
-- Name: subscription_signups_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.subscription_signups_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.subscription_signups_id_seq OWNER TO neondb_owner;

--
-- Name: subscription_signups_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.subscription_signups_id_seq OWNED BY public.subscription_signups.id;


--
-- Name: user_achievements; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.user_achievements (
    id integer NOT NULL,
    user_id integer NOT NULL,
    achievement_id integer NOT NULL,
    unlocked_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.user_achievements OWNER TO neondb_owner;

--
-- Name: user_achievements_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.user_achievements_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.user_achievements_id_seq OWNER TO neondb_owner;

--
-- Name: user_achievements_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.user_achievements_id_seq OWNED BY public.user_achievements.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.users (
    id integer NOT NULL,
    first_name text NOT NULL,
    last_name text NOT NULL,
    email character varying(255) NOT NULL,
    password text NOT NULL,
    phone_number character varying(20) NOT NULL,
    address text NOT NULL,
    is_admin boolean DEFAULT false NOT NULL,
    points integer DEFAULT 0 NOT NULL,
    level integer DEFAULT 1 NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    last_login timestamp without time zone
);


ALTER TABLE public.users OWNER TO neondb_owner;

--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.users_id_seq OWNER TO neondb_owner;

--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: achievements id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.achievements ALTER COLUMN id SET DEFAULT nextval('public.achievements_id_seq'::regclass);


--
-- Name: branches id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.branches ALTER COLUMN id SET DEFAULT nextval('public.branches_id_seq'::regclass);


--
-- Name: cars id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.cars ALTER COLUMN id SET DEFAULT nextval('public.cars_id_seq'::regclass);


--
-- Name: collaboration_submissions id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.collaboration_submissions ALTER COLUMN id SET DEFAULT nextval('public.collaboration_submissions_id_seq'::regclass);


--
-- Name: service_history id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.service_history ALTER COLUMN id SET DEFAULT nextval('public.service_history_id_seq'::regclass);


--
-- Name: subscription_signups id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.subscription_signups ALTER COLUMN id SET DEFAULT nextval('public.subscription_signups_id_seq'::regclass);


--
-- Name: user_achievements id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.user_achievements ALTER COLUMN id SET DEFAULT nextval('public.user_achievements_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Data for Name: achievements; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.achievements (id, name, description, required_points, created_at) FROM stdin;
\.


--
-- Data for Name: branches; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.branches (id, name, location, queue_count, google_maps_url, google_maps_embed_url, review_url, last_queue_update, is_open) FROM stdin;
3	Cuci Xpress Bengkurong	Bengkurong	0	https://maps.google.com	https://www.google.com/maps/embed?pb=!1m1!1e3!1m18!1m12!1m3!1d3975.5731912422993!2d114.87025717581346!3d4.843101440404901!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x32226116dcfebd73%3A0x24b5e5ecad20aad5!2sCuci%20Xpress%20Bengkurong!5e1!3m2!1sen!2sbn!4v1739615158650!5m2!1sen!2sbn	https://g.page/review	2026-05-02 00:02:06.121	t
4	Cuci Xpress Tutong	Tutong District	0	https://maps.google.com	https://www.google.com/maps/embed?pb=!1m1!1e3!1m18!1m12!1m3!1d3975.8213084359318!2d114.6494731758136!3d4.8007134407807275!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x32226f073c768f6f%3A0x690aee0201830d2b!2sCuci%20Xpress%20Tutong!5e1!3m2!1sen!2sbn!4v1739615190771!5m2!1sen!2sbn	https://g.page/review	2026-05-01 23:21:45.295	f
2	Cuci Xpress Salar	Salar, Bandar Seri Begawan	0	https://maps.google.com	https://www.google.com/maps/embed?pb=!1m1!1e3!1m18!1m12!1m3!1d3974.649485659081!2d115.0225711758136!3d4.997753939009062!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3222f17abf435e93%3A0xf63cdda5b6129e12!2sCuci%20Xpress%20Salar!5e1!3m2!1sen!2sbn!4v1739615130326!5m2!1sen!2sbn	https://g.page/review	2026-04-04 00:02:45.066	f
1	Cuci Xpress Tungku	Tungku, Bandar Seri Begawan	0	https://maps.google.com	https://www.google.com/maps/embed?pb=!1m1!1e3!1m18!1m12!1m3!1d3975.093870072313!2d114.91127379999998!3d4.9239572!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3222f5127dd8727d%3A0x361092c4c2a4750a!2sCuci%20Xpress%20Tungku%20Link!5e1!3m2!1sen!2sbn!4v1771393505709!5m2!1sen!2sbn	https://g.page/review	2026-05-01 00:07:45.366	t
5	Cuci Xpress Lambak	Kg. Lambak Kanan, Bandar Seri Begawan BB1714	0	https://maps.app.goo.gl/uXpressLambak	https://www.google.com/maps/embed?pb=!1m1!1e3!1m18!1m12!1m3!1d5475.71188882535!2d114.95248600000001!3d4.971576499999999!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3222f7c5866be009%3A0xe9b73d48bc7a2f3a!2sCuci%20Xpress%20Lambak!5e1!3m2!1sen!2sbn!4v1771390513515!5m2!1sen!2sbn	https://g.page/review	2026-04-15 23:54:52.945	f
\.


--
-- Data for Name: cars; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.cars (id, user_id, license_plate, brand, model, type, photo_url) FROM stdin;
1	1	BAT4455	Honda	Accord	Sedan	\N
4	5	BAP4455	Haval	H6 GT	SUV	\N
5	7	BAR4545	Hyundai	H1	Van	\N
107	117	BAB6683	Toyota	Rush	4wd 	\N
7	7	BAT321	Mercedes	G-Wagon	SUV	\N
9	8	BBD9341	Toyota	Criss	SUV	\N
10	5	BAT4455	Honda	Accord	Sedan	\N
11	10	BAH3355	Toyota	Camry	Sedan	\N
12	11	BBH3009	Neta	V	Hatchback	\N
13	11	BBG6149	Honda	Odyssey	Wagon	\N
14	12	BAR2713	Toyota	Wigo	Hatchback	\N
15	6	BAC4455	Jeep	Wrangler	Suv	\N
16	6	BAL4455	Hyundai	H1	Van	\N
17	6	BAH4455	Bmw	3series	Sedan	\N
18	6	KJ4454	Kia	Caren	Mpv	\N
19	13	BAG9228	Hyundai	Santa Fe	Suv	\N
20	13	BAV9228	Kia	Cerato	Sedan	\N
21	14	Bah8008	Lexus	US 	Suv 	\N
22	15	Baf644	Hyundai	Tucson	Wagon	\N
23	16	BBC4730	Toyota	Corolla Altis	Sedan	\N
24	18	BAW1718	Mazda	CX5	SUV	\N
25	17	KL378	Toyota	Cross	SUV	\N
26	21	BBB 8414	Toyota	Veloz	MPV	\N
27	25	BAK8939	Hyundai	Santafe	SUV	\N
28	28	BBH9043	Proton	S70	Sedan	\N
29	29	KK4455	Honda	Civic 	Sedan 	\N
30	30	BBJ 5186	Toyota 	Yaris cross 	Suv	\N
31	22	BAZ7585	Mini	Mini	Small	\N
33	19	BA9228	BMW	X3	SUV	\N
34	32	BAE910	Kia	Sorento	SUV	\N
35	34	BAZ7108	Toyota	Corolla Cross	SUV	\N
36	35	BJ6100	Mitsubishi	Labcer	Sedan	\N
37	36	BAU589	Honda	HRV	Wagon	\N
38	36	BAW589	Hyundai	H1	Wagon	\N
39	37	BAX5921	KIA	Cerato	Hatchback	\N
40	38	BBE7008	Kia	Seltos	SUV	\N
41	39	BV9493	Toyota	Wigo	Hatchback	\N
42	40	KH1927	Honda	Jazz	hatchback	\N
43	41	BBD7430	KIA	Seltos	SUV	\N
44	42	BBA6516	Hyundai	Elantra	Sedan	\N
45	43	BBB7744	Mercedes	C180 coupe	Coupe	\N
46	44	BBE5741	Hyundai	Stargazer	Mpv	\N
47	47	BJ9404	Audi	A4 S-Line	Sedan	\N
48	49	BAY 309	KIA	Cerato	Sedan	\N
49	48	B4382	Mercedes Benz 	E280	Sedan	\N
50	51	BAK3818	Kia	Rio	Hatchback	\N
52	50	BAS3857	Mitsubishi	ASX	SUV	\N
53	50	BBA2826	Kia	Sportage	SUV	\N
54	54	BAF976	Toyota	Camry	Sedan	\N
55	54	BAL976	Lexus	GS300	Saloon	\N
56	55	BBD5627	Subaru	XV	Compact SUV	\N
57	57	Bar 924	Kia	Cerato	Hatchback	\N
58	59	BAL433	TOYOYA	Vellfire	Van	\N
59	61	BAV4485	Kia	Rio	Hatchback	\N
60	62	BBH7714	Proton	X90	MPV	\N
61	63	BAC3862	KIA	Sportage	SUV	\N
62	33	Bay 2695	Hyundai 	H1 	Van	\N
63	65	BAH4848	Hyundai	Elantra	Sedan	\N
64	67	BAR7219	Kia	Cerato	Sedan	\N
65	68	BBC3269	Honda	HRV	Compact crossover SUV	\N
66	70	BAJ7731	Nissan 	March 	Hatchback 	\N
67	71	BBB2995	MG	HS	SUV	\N
68	72	kj4447	mazda 3	2012	sedan	\N
69	73	BBA9459	Suzuki	Spresso	Hatchback	\N
70	74	BBB978	Kia	Sportage 	SUV	\N
71	75	BBG2427	Toyota	Vios	Sedan	\N
72	75	BS7173	Toyota	Cross	SUV	\N
73	77	Bbe205	Mazda	Cz-30	Suv	\N
74	79	BBJ 7385	PERODUA	BEZZA L 1.0	Sedan	\N
75	80	BBJ 7385	Perodua	Bezza	Sedan	\N
76	81	Bay5181	Honda	Civic fc	Sedan	\N
77	66	BBF572	Hyundai	Creta	SUV	\N
78	82	BAU135	Mitsubishi	Lancer EX	Sedan	\N
79	83	BBH690	Honda 	HRV	SUV	\N
80	85	BAH14	Toyota Prado	2019	XL SUV	\N
81	87	BBH7088	Proton	X90	SUV	\N
82	88	BAZ9056	Kia	Seltos	SUV	\N
83	89	Bae8456	Hyundai	Accent	Sedan	\N
84	92	BBE7607	Kia	Carnival	MPV	\N
108	118	BAY 2515	Suzuki	Swift	Hatchback	\N
86	93	BBA2819	Proton 	X50	SUV	\N
87	94	BBE7886	Toyota 	Rush	SUV	\N
88	95	BBG6120	Toyota	Corolla Altis	Sedan	\N
89	95	BBC2708	KIA	Sportage	SUV	\N
90	96	BAB7450	Toyota	Vios	Sedan	\N
91	97	BAN4747	KIA	SORENTO	Wagon	\N
92	98	BBD6229	Suzuki	Jimny	Suv	\N
93	99	BBG5693	Kia	Seltos	SUV	\N
94	100	BAE2839	Hyundai	Grand i10	Sedan	\N
95	101	BBC4900	Toyota	Alphard	MPV	\N
96	105	kc8000	nissan	xtrail	suv	\N
97	106	KK4455	Honda 	FD	Sedan	\N
98	107	BK8919	Lexus 	Es250	Sedan	\N
99	108	Bbg1947	Perodua 	Alza	MPV	\N
100	103	Bax4710	Toyota	Previa	Mpv	\N
101	110	BBC 5414	Mg	Zs	Suv	\N
102	109	BBH8538	Mazda	3	Sedan	\N
103	111	BAS	Range Rover	Evoque	SUV	\N
104	112	BBB4017	Kia	Cerato	Hatchback	\N
105	113	BAW7532	Toyota	Rush	Suv	\N
106	114	BAM2069	toyota	vellfire	Station wagon	\N
109	120	BAZ6158	Hyundai	Creta	SUV	\N
110	119	BBA 6115	Kia	Cerato	Sedan	\N
111	121	BAQ7797	Lexus	NX	SUV	\N
112	122	BAV6576	KIA	Cerato	Sedan	\N
113	125	Bax5110	Toyota	Alphard	Van	\N
114	129	BBE1994	Mitsubishi Pajero	2006	SUV	\N
115	128	BBE2170	Kia	Caren 2023	MPV	\N
116	128	KB245	Kia	Seltos	SUV	\N
117	131	BAK8648	Nissan	Terra	SUV	\N
118	132	BBF1360	Hyundai	Verna	Sedan	\N
119	137	BAQ3716	Hyundai	Veloster	Hatchback	\N
120	136	KN5830	Mazda	CX-30	Crossover	\N
121	135	B669	Lexus	NX F-Sport	SUV	\N
122	138	BA828	Mercedes	A200	Sedan	\N
123	140	BAY401	MG 	HS	SUV	\N
124	139	BAY5146	Mg	Zs	SUV	\N
125	141	BBG 6052	Suzuki	Grand Vitara	SUV	\N
32	31	BAG299	Kia	Sorento	SUV	\N
126	143	BAW3897	Suzuki	Swift 1.2 GLX 2018	Hatchback 	\N
127	143	BBJ8472	Wuling 	Alvez 1.5	SUV	\N
128	52	BAS5804	Kia	Optima	Sedan	\N
51	52	BAJ52	BMW	5series	Sedan	\N
129	145	BAA141	Fortuner	2008	4x4 SUV	\N
130	146	BAQ3711	Mitsubishi	Lancer 	Sedan	\N
131	147	KC526	Honda	JAZZ	Hatchback	\N
132	148	BAB9263	Mitsubishi	Lancer ex	Sedan	\N
133	149	BBc7852	Mazda	Cx5	Suv	\N
134	150	KL1727	Nissan	370z	Coupe	\N
135	151	BAX873	Toyota	Yaris	Hatchback	\N
136	152	BAZ1530	Kia 	cerato	Sedan	\N
137	153	BAA6808	Hyundai	Elantra	Sedan	\N
138	155	BBB5592	Kia	Carnival	MPV	\N
139	156	BBF1304	Kia	Sportage	SUV	\N
140	157	BT8161	Mazda	3	Sedan	\N
141	159	KN 3987	toyota	Vios 2009	Sedan	\N
142	158	BBG7232	Proton	X50	Suv	\N
143	161	BBF 5289	hyundai tucson	Tucson	Suv	\N
144	163	KN9796	Lexus	CT200h	HATCHBACK	\N
145	164	BAX9451	Mazda 	Cx30	Compact SUV	\N
146	165	Bay3656	Mg	Hs	Suv	\N
147	167	BAZ175	Proton	X50 Flagship	SUV	\N
148	169	BJ1333	Nissan 	Terra	Suv	\N
149	171	BBH1806	Hyundai	Tucson	SUV	\N
150	173	BBH3630	Toyota	Corolla cross	Suv	\N
151	174	BAV 6269	Suzuki	Swift	Hatchback	\N
152	175	BBB5037	Mazda	CX 5	SUV	\N
153	176	KN401	BMW	X1	SUV	\N
154	177	BAP7372	Toyota	Fortuner	SUV	\N
155	178	BAH1729	Toyota	Vios	Sedan	\N
156	180	Bt1507	Toyota	Camry	Sedan	\N
157	181	Baq8862	Lexus	Es250	Sedan	\N
158	182	BAW8371	NISSAN	TERRA	SUV	\N
159	183	Bau940	Suzuki	Swift	Hatchback	\N
160	184	BBH2190	Suzuki	Jimny	SUV	\N
161	186	BBC127	Toyota	Toyota CHR	Hatchback	\N
162	187	Bap 4041	Kia 	sportage	wagon	\N
164	189	Bat267	Mitsubishi	Attrage	Sedan	\N
165	191	BBG5862	Nissan	Terra	SUV	\N
166	192	BBA 9956	AUDI	A3	Sedan	\N
167	193	BAU9378	Suzuki	Vitara	SUV	\N
168	194	BBJ5137	toyota	Fortuner	SUV	\N
169	195	bax2943	creta	2019	suv	\N
170	196	BAL5848	Toyota	Vellfire	MPV	\N
171	197	BAS6648	Suzuki	Swift 2015	Hatchback	\N
172	198	BAP2576	Kia	Seltos	SUV	\N
173	199	BBG4217	Hyundai	Elantra 2012	Sedan	\N
174	201	BAN9495	Nissan	Almera	Saloon	\N
175	204	kj5452	Chevrolet 	Aveo 2003	Sedan	\N
176	202	BBE 7358	Kia cerato	2029	Hatchback	\N
177	205	Audi 4455	Audi	Audi	Audi	\N
178	172	BAE6883	Toyota	Vios	Sedan	\N
179	206	BBG567	Toyota 	Fortuner	SUV	\N
180	207	Kn5990	Toyota	Yaris	Hatchback	\N
181	208	BAQ4731	Hyundai	Tucson	SUV	\N
182	209	BBB1116 	Jeep 	Compass	SUV	\N
183	210	BAZ9228	Kia	Optima	Sedan	\N
184	211	BBD2815	Suzuki swift	2015	Hatchback	\N
185	213	BAA 1683	Toyota	Fortuner	SUV	\N
186	214	BAN1199	Mercedes Benz	E200	Sedan	\N
187	215	br628	bmw	118i	hatchback	\N
188	217	BBB8233	BMW	218i	Sedan	\N
189	218	BAC628	BMW	X3 20 msport	SUV	\N
190	219	Bav 3168	Kia	Carnival	Mpv	\N
191	220	BBA8372	BMW	GLA200	SUV	\N
192	221	BAP6542	Volkswagen	Jetta	Sedan	\N
193	222	bah885	Toyota	Prado	4x4	\N
194	223	BAH 8240	Kia	Optima	Sedan	\N
195	224	BAV2784	Suzuki	Celario	Sedan	\N
196	225	BBG118	Toyota	Yaris Cross	SUV	\N
197	226	Bau1526	Mazda	Cx3	Sedan	\N
198	227	BAJ6424	Suzuki	Swift	Hatchback	\N
199	228	BBJ 2715	Toyota	Yaris Cross	SUV	\N
200	230	BBH8011	Honda	Brio	Hatchback	\N
201	230	BV8011	Honda	Civic	Sedan	\N
202	231	BAQ941	KIA	Stinger	Sport Sedan	\N
203	233	BBF411	Haval	Jolion	Hatch back	\N
204	234	BBJ3705	Hyundai 	Stargazer 	MPV	\N
207	247	BAC 4022	Toyota	2012	SUV	\N
208	248	BAN3860	Mitsubhisi	2014	Sedan	\N
210	249	BN4347	Lancer	MITSUBISHI 	Sedan	\N
211	270	CX1	CuciXpress	Tungku	Sedan	\N
212	251	BBE 4078	KIA	Soluto	sedan	\N
213	282	Bbh1785	ferari	i30	hatchback	\N
214	253	BBE 1816	Suzuki	Celerio	Suv	\N
215	283	BAX 3338	Toyota	Vios	Sedan	\N
216	284	CX2	Cuci Xpress	Salar	Sedan	\N
217	270	CX3	Cuci Xpress	Bengkurong	Sedan	\N
218	285	CX3	Cuci Xpress	Bengkurong	Sedan	\N
219	286	BAC1224	Nissan 	Terra	SUV	\N
220	287	CX4	Cuci Xpress	Tutong	Sedan	\N
221	288	BBE9990	Mitsubishi 	Lancer	Sedan	\N
222	288	BBC3122 	Kia	koup	Coupe	\N
223	289	BAX 9969	HYUNDAI	KONA	SUV	\N
224	290	B 5831	Proton 	X50	Suv	\N
225	291	BBA4380	NISSAN	ALMERA	sedan	\N
226	292	BF292	Volkswagen	Polo GTI	Hatchback	\N
227	287	Bba4380	Nissan	Almera	Sedan	\N
228	294	W6162QE	Honda	City	Sedan	\N
229	287	KH784	TOYOTA	TOYOTA	SUV	\N
230	287	BAS2153	TOYOTA	TOYOTA	SUV	\N
231	287	KN895	KIA	KIA	SUV	\N
232	295	BAH4600	Mazda	CX-5	SUV	\N
234	296	BBH1283	Kia	Carnival	MPV	\N
233	295	BK4600	Haval	Jolion	SUV	\N
235	297	BAC392	KIA	Sorento	Wagon	\N
236	287	BBS 2190	SUZUKI 	Suzuki 	SUV	\N
237	287	BBH5903	TOYOTA	TOYOTA	SUV	\N
238	287	BBD602	MERCEDES	MERCEDES 	SUV	\N
239	298	BFF2757	Suzuki	S-presso	Hatchback	\N
240	299	Baw 4263	Alfa Romeo	Giulia Veloce	Sedan	\N
241	301	BBE 7701	Mazda	CX-3	Suv	\N
242	287	BAT7713	MAZDA	MAZDA	Suv	\N
243	303	BBB6254	Audi	Q3	SUV	\N
244	304	BAB237	Kia	Carnival	MPV	\N
245	90	By8922	Vw	Gti	Small car	\N
246	287	BG 2253	MITSUBISHI 	MITSUBISHI 	SUV	\N
247	287	KR 8694	TOYOTA	TOYOTA	SUV	\N
248	305	BBH7231	MG	MG HS	Compact SUV	\N
355	52	BBC52	GWM	Tank 500	MPV	\N
249	287	KG2151	MAZDA 	PREMACY	SUV	\N
252	287	BAS 1122	NISSAN 	TERRA	SUV	\N
253	287	BBH 7139	WULING 	WULING 	SEDAN	\N
254	287	KG514	TOYOTA 	FORTUNE 	SUV	\N
255	287	BBD199	LANDROVER 	LANDROVER 	SUV	\N
256	287	BQ5567	MITSUBISHI 	MITSUBISHI 	SEDAN	\N
257	287	BAF5659	TOYOTA	TOYOTA 	SUV	\N
258	287	KR596	DAIHATSU	DAIHATSU	E.G	\N
259	287	BAZ4128	TOYOTA 	TOYOTA 	SEDAN	\N
260	287	KL 1399	TOYOTA	TOYOTA	SEDAN	\N
261	287	BAG9993	TOYOTA	TOYOTA	SUV	\N
262	287	BAB6707	NISSAN 	NISSAN 	SEDAN	\N
263	287	KD 331	KIA	KIA	SUV	\N
264	287	BAV1741	MAZDA	MAZDA	SUV	\N
265	287	BAX 7258	SUZUKI 	SUZUKI 	SUV	\N
266	287	BQ7579	KIA	KIA	E.G	\N
267	307	BAM 3381	Mitsubishi	Lancer	Sedan	\N
268	308	BBD8060	Toyota	Veloz	MPV	\N
269	287	BBD 7411	MAZDA	MAZDA	E.g	\N
270	287	BBD 7411	MAZDA	MAZDA	SUV	\N
271	287	BAX 4041	KIA	KIA	SUV	\N
272	287	BAS9630	NISSAN 	NISSAN 	SUV	\N
273	287	BAL7252	SUZUKI	SUZUKI	SUV	\N
274	287	BAU8822	MERCEDES 	MERCEDES 	E.G	\N
275	287	BBE 5643	HYUNDAI 	HYUNDAI 	SEDAN	\N
276	287	BS3661	HONDA 	HONDA 	SUV	\N
277	309	BBH6506 	Toyota	Yaris Cross	SUV	\N
278	287	BAW1533	SUZUKI 	SUZUKI 	SUV	\N
279	287	BT3133	NISSAN	NISSAN	SUV	\N
280	287	KL109	KIA	KIA	SUV	\N
281	287	KS9193	TOYOTA	TOYOTA 	SUV	\N
282	287	BBA 7966	HYUNDAI 	HYUNDAI 	EG	\N
283	287	BAW1342	KIA	KIA	SEDAN	\N
284	287	KF7735	KIA	KIA	SUV	\N
285	287	BAB3127	TOYOTA	TOYOTA	SUB	\N
286	287	BBC806	KIA	KIA	SUV	\N
287	310	BAT1831	Chevrolet	Captiva	SUV	\N
288	311	Baa116	Bmw	5 series	Sedan	\N
289	287	BBF1713	PROTON	PROTON	SUV	\N
290	287	BBG 	HAVAL	HAVAL	SUV	\N
291	287	BBC8330	KIA	KIA	SUV	\N
292	287	BBB5592	KIA	KIA	SUV	\N
293	287	KL127	MITSUBISHI 	MITSUBISHI 	E.G	\N
294	287	BAP 2576	KIA	KIA	SUV	\N
295	287	BU2601	SUZUKI 	SUZUKI 	E.g	\N
296	312	BJ58 	Mercedes	E300	Sedan 	\N
297	313	BBB2794	Hyundai	Tucson	Wagon	\N
298	287	BBE7005	MG	MG	SUV	\N
299	314	BM4550	Suzuki	Vitara	SUV	\N
300	287	KK9292	LEXUS 	LEXUS 	SUV	\N
301	287	BBC9459	KIA	KIA	SUV	\N
302	287	 BW2300	TOYOTA	TOYOTA	SUV	\N
303	287	KS574	TOYOTA	TOYOTA 	SUV	\N
304	287	KK2665	HYUNDAI 	HYUNDAI 	SUV	\N
305	287	BAN5594	Jeep	JEEP 	SUV	\N
306	287	BQ840	TOYOTA 	TOYOTA 	E.G	\N
307	287	KA1112	NISSAN 	NISSAN 	SUV	\N
308	315	BBA6032	Toyota	Fortuner	SUV	\N
309	287	BBA6032	TOYOTA 	TOYOTA	SUV	\N
310	287	KR 895	HONDA 	HONDA 	SUV	\N
311	287	BAZ9470	KIA	KIA	SUV	\N
312	287	BBD 2485	SUZUKI 	SUZUKI 	SUV	\N
313	316	BQ690	Kia	Rio	Hatchback	\N
314	287	BBG 5181	SUZUKI 	SUZUKI 	SUV	\N
315	287	BAC6089	TOYOTA	TOYOTA	SUV	\N
316	317	BAV 4099	Kia	Cerato	Sedan	\N
317	287	BAY8691	BMW	BMW	SUV	\N
318	287	BAW6283	HYUNDAI	HYUNDAI	SUV	\N
319	318	BAZ9095	Suzuki	Swift	Hatch back	\N
320	287	BAR657	VOLKWAGEN 	VOLKWAGEN 	SEDAN	\N
321	52	BBJ5552	GWM	Tank 500	MPV	\N
323	287	BY5203	PROTON 	PROTON 	EG	\N
324	287	BAY9251	TOYOTA	TOYOTA	SUV	\N
325	319	BAV5455	BYD	Sealion 6	SUV	\N
326	287	BAC7989	KIA	KIA	SEDAN	\N
327	287	BBH4110	LEXUS	LEXUS	SEDAN	\N
328	321	BAR315	Jaguar	XE	Sedan	\N
329	287	BAH6602	JEEP	JEEP	SUV	\N
330	287	HONDA KD7688	HONDA 	HONDA 	SEDAN	\N
331	322	BBH115	Toyota	Corolla Cross	SUV	\N
332	324	BAZ855	Mazda	CX5	SUV	\N
333	287	BAV9881	KIA	KIA	SUV	\N
334	287	BBD742	HONDA	HONDA	SUV	\N
335	287	BBD 4568	KIA	KIA	SUV	\N
336	287	BAQ 8508	DODGE 	DODGE 	SUV	\N
337	287	KL 1344	HYUNDAI 	HYUNDAI 	SEDAN	\N
338	287	BBH 8359	SUBARU 	SUBARU 	SEDAN	\N
339	287	BAE1453	SUBARU 	SUBARU 	SEDAN	\N
340	325	BBG215	MG	HS	SUV	\N
341	287	BBJ 9057	TOYOTA	TOYOTA 	SUV	\N
342	287	BBF7141	TOYOTA	TOYOTA	SUV	\N
343	287	BBJ8110	MAZDA	MAZDA	SUV	\N
344	326	BJ131	Toyota	Innova	SUV	\N
345	327	BBH5090	Kia	Soluto	Sedan	\N
346	287	BAK8670	MAZDA	MAZDA	SEDAN	\N
347	328	BF237	Lexus	RX350	SUV	\N
348	287	BBJ 1596	NISSAN 	NISSAN 	SUV	\N
349	287	KG 4504	TOYOTA	TOYOTA	SEDAN	\N
350	329	BBC5176	Mazda	CX30	Mini SUV	\N
351	287	BT114	TOYOTA	TOYOTA	SUV	\N
352	331	BAR 1070	Mitsubishi Lancer EX	Lancer EX	Sedan	\N
353	3	BAT4455	Honda	Accord	Sedan	\N
354	332	BT1159	Toyota	Vios	Sedan	\N
356	287	BFF877	HONDA 	HONDA 	SUV	\N
357	287	BBD3922	TOYOTA	TOYOTA	SUV	\N
358	287	BAW5082	SUZUKI 	SUZUKI 	SUV	\N
359	287	BBG5625	Baic	Baic	SUV	\N
360	333	BK9622	Lexus	RX	SUV	\N
361	334	BBF5486	Kia sonet	Subcompact	SUV	\N
362	335	BBE3212	Honda	HR-V	SUV	\N
363	336	BBF433	Hyundai	Creta	SUV	\N
364	337	BBH8561	Toyota 	Innova 	MPV	\N
365	337	BAV4531	Toyota	Vios	Sedan	\N
366	338	BBG 3504	Proton	X50	SUV	\N
367	338	BAJ 3863	Kia	Rio	Hatchback	\N
368	339	B438	Mercedes Benz	CLA200SB	Sedan	\N
369	340	BC9999	Mini	JCW Anniversarry Edition	Hatchback	\N
370	341	Baf4971	Honda 	Stepwagon	Wagon	\N
371	342	BBK8604	Proton	X50	SUV	\N
372	343	BAM 7700	Kia	Rio	Sedan	\N
373	343	BAK3912	Mistubishi	Xpander	SUV	\N
374	287	BBB3843	KIA	k	SUV	\N
375	287	BAA9953	TOYOTA	TOYOTA	SUV	\N
376	287	KG7411	TOYOTA	TOYOTA	SUV	\N
377	287	BEBE7121	KIA	KIA 	SUV	\N
378	287	BAG299	KIA	KIA	SUV	\N
379	287	BBA6585	KIA	KIA	E.g	\N
380	287	BAS 1122	NISSAN 	TERRA	SUV	\N
381	287	KM8311	NISSAN 	TERRA	SUV	\N
382	287	BBA2185	SUZUKI 	SUZUKI 	E.G	\N
383	287	KN163	TOYOTA	TOYOTA	SUV	\N
384	287	BBG5490	HYUNDAI 	HYUNDAI 	SUV	\N
385	344	BBE 8611	Kia	Sonet	Mini SUV	\N
386	287	BAY3645	HONDA 	HONDA 	E.G	\N
387	345	BBJ 3118	Haval	H6Gt	Coupe SUV	\N
388	346	BBF 752	Toyota	Raize	SUV	\N
389	346	BAE 652	Toyota	Vios	Sedan	\N
390	287	BAH244	HONDA 	HONDA	SEDAN	\N
391	287	BU546	SUZUKI 	SUZUKI 	SUV	\N
392	347	KS5880	Toyota	CH-R	Crossover SUV	\N
393	347	BAX6834 	Kia	Seltos 	Wagon	\N
394	348	BAJ9311	Suzuki	Swift 1.4	Subcompact	\N
395	349	Bae 206	MAZDA 8 	2012	Mpv	\N
396	287	Bay 5032	Mg	MG	EG	\N
397	287	BBJ8110	MAZDA	MAZDA	SUV	\N
398	350	BAY 7837	Suzuki	Espresso	Sedan	\N
399	351	BAA321	Mazda	3 Skyactiv	Sedan	\N
400	352	BBC9263	Suzuki	Suzuki ertiga	Suv	\N
401	353	BAW 7808	Suzuki	Swift	Small/Subcompact 	\N
402	354	BBJ836	Toyota	Yaris Cross	SUV	\N
403	355	BBG2337	Kia	Cerato	Hatchback	\N
404	356	KS8869	Toyota	Fortuner 	SUV	\N
405	357	BBK7804	Hyundai	Venue	Compact SUV	\N
406	358	BAZ705	Kia	Stinger	Sedan	\N
407	362	BBE7670	Kia	Sportage	Compact SUV	\N
408	363	BBH4023	Mazda	2	Hatch Back	\N
409	365	BR1491	Hyundai	Kona	SUV	\N
410	366	BBK3919	TOYOYA	Fortuner	SUV	\N
411	367	BBC7677	BYD	Sealion 6	SUV	\N
412	368	BAL9592	Kia	Optima	Sedan	\N
413	370	BBC7053	Toyota	Rush 	SUV	\N
414	370	BBA2433	Kia	Picanto	Hatchback	\N
415	371	KP7668	Toyota	Fortuner	SUV	\N
416	372	BAN7480	Toyota	Wigo	Sedan	\N
417	373	BAW7715	Suzuki	Swift	Hatchback	\N
418	374	BBB3141	Toyota	Raize 1.0	Wagon	\N
419	375	BBH368	Kia	Cerato	Hatchback	\N
420	376	8824	Kia	S	Suv	\N
421	377	BBH2528	Perodua	Alza	MPV	\N
422	302	BAG7537	Lexus 	NX 	SUV	\N
423	379	Lambak	Lambak	Lambak	Lambak	\N
424	381	BAZ 2615	Suzuki	Swift ZC63S	Hatchback	\N
425	382	BR551	Mazda 	Mazda 2 1.5 Skyactiv	Hatchback	\N
426	385	Bay 2695	Hyundai 	H1	Van	\N
427	386	BAC4210	Toyota	Vios	Sedan	\N
428	387	BBL3656	Toyota	Yaris Cross	SUV	\N
429	390	BBG3275	Toyota 	86	Coupe	\N
430	392	BW 622	BMW	5201	Saloon	\N
431	393	BAW9543	Kia	Cerato	Sedan	\N
432	394	BBK5285	Suzuki	Celerio	Hatchback	\N
433	394	BAL8948	Toyota	Vios	Sedan	\N
434	395	BBB3538 	Suzuki	Brezza	SUV	\N
435	396	BBE6239	Hyundai	i20	small	\N
436	398	KP1903	Honda	Honda Stream RSZ 	MPV	\N
437	399	BBJ3859	Proton	X70	SUV	\N
438	402	BAY194	Proton	X50	Mini SUV	\N
439	403	BBG9101	Toyota	Fortuner	Suv?	\N
440	404	BV2949	Mazda	3	Sedan	\N
441	406	BBB9275	Mitsubi	Attrage	Sedan	\N
443	407	BAS4422	Haval	Jolion	SUV	\N
444	409	BBE4762	Hyundai	Tucson	SUV	\N
445	410	BBE7871	Suzuki	Kizashi	Sedan	\N
446	411	BAX1993	MG	ZS	SUV	\N
447	412	BBE9400	Mazda 3	Mazda 3	Hatchback	\N
448	412	BAV7593	Mazda	CX5	SUV	\N
449	413	BBK6852	GWM	Tank 300	SUV	\N
450	415	BBE1970	Honda	Jazz	Sedan	\N
451	416	Km1927	Suzuki	Vitara	Suv	\N
452	417	BAX1544	Lexus	UX200	SUV	\N
453	418	BBD260	Hyundai	Tucson	Suv	\N
454	419	BBK7890	Kia	Cerato	Sedan	\N
455	420	BAY4513	Kia	Cerato	Sedan	\N
456	421	BBG3463	Toyota	Yaris Cross	Suv	\N
457	422	BBC5388	BMW	420i M Sport	Coupe	\N
458	422	BBL9587	Mercedes-Benz	A250 AMG Line	Hatchback	\N
459	422	BBF8152	Honda	Odyssey RB1	MPV	\N
460	423	BBB7592	Kia	Rio	Hatchback	\N
461	424	BAH8476	Honda 	Honda Jazz	Hatchback	\N
462	425	BAX4959	Kia	Rio	Hatchback	\N
463	427	BBD4422	Mazda	CX 5	SUV	\N
464	426	BBB2958	Proton	X70 ES	SUV	\N
465	426	B216	Toyota	Vios	sedan	\N
466	428	BAJ8172	Toyota	Avanza	Suv	\N
467	401	BL521	PROTON 	X50	SUV	\N
468	429	BBC9984	Proton	X50	SUV	\N
469	429	BAP7350	Hyundai	Elantra	Sedan	\N
470	431	BBD5512	Toyota	Hilux	Double cab	\N
471	430	BBH3439	Mitsubishi 	Pajero Sports	SUV	\N
472	432	KM2515	Mini Cooper	Country Man	SUV	\N
473	433	BAX310	Mazda	CX9	SUV	\N
474	434	BBG8952	Hyundai	Tucson	SUV	\N
475	435	BL3131	Kia	Sportage	SUV	\N
476	435	BBD4422	Mazda	CX-5	SUV	\N
477	436	KF303	Toyota	Prado	SUV	\N
478	436	B1303	Lexus	GS300	Sedan	\N
479	437	BBA1728	KIA	Carnival	MPV	\N
480	438	BE337	Toyota Fortuner	2020	SUV	\N
481	440	BBE4988	Toyota	Wigo	Hatchback	\N
482	439	BBE8793	Suzuki	Ertiga	Wagon	\N
483	441	Bb1234	.	.	.	\N
484	442	Bbb111	.	.	.	\N
485	443	BBB8304	Kia	Cerato	Sedan	\N
486	444	BBH9764	Nissan	Almera	Sedan	\N
487	445	BBB6254	Audi	Q3	SUV	\N
488	447	B550	Audi	A4	Sedan	\N
489	446	BAC481	Honda	Jazz GE	Hatchback	\N
490	448	BBJ1279	Nissan	Terra	SUV	\N
491	449	BC8	BMW	X3	SUV	\N
492	449	BAZ26	Hyundai	Elantra	Sedan	\N
493	450	KP6400	Hyundai	Verna	Sedan	\N
494	451	BAM698	Mercedes Benz	C63	Sedan	\N
495	452	BAL464	BYD	Sealion 6	SUV	\N
496	453	BBK 5138	SKODA	KUSHAQ	SUV	\N
497	454	BBL9569	Mazda	CX-60	SUV	\N
498	455	KM9322	Toyota	Vios	Sedan	\N
499	456	BBB152	GWM	Haval H6 GT	SUV	\N
500	457	bbg8910	proton	x50	suv	\N
501	458	BBE 2791	Kia	Sonet	SUV	\N
502	459	Bax7408	Nissan	Terra	Suv	\N
503	460	BAZ9031	MG	ZS	SUV	\N
504	461	BBA646	Hyundai 	Creta	SUV	\N
505	462	KF935	Toyota	Vios	Sedan	\N
506	464	BBG7092	PROTON	S70	SEDEN	\N
507	465	BBK3450	BYD	SL6	SUV	\N
508	467	BBF1560	Kia	Sportage	SUV	\N
510	469	BV305	Kia 	Kia Sportage	SUV	\N
511	470	BAV5575 	Kia grand carnival	Grand carnival	Wagon	\N
512	471	BBL6758	KIA	Carens	MPV	\N
513	474	BBF1509	Proton	S70	Sedan	\N
514	472	BBD5964	Hyundai	Creta	Suv	\N
515	477	BBB7702	Haval 	H6	suv	\N
516	478	BM3080	Suzuki	Jimny 5 doors	Suv	\N
517	480	BAW3570	Hyundai	Hyundai	sedan	\N
518	479	BJ526	Honda	Crv	Suv	\N
519	482	BBC218	MG	HS	SUV	\N
520	483	BBL3800	Haval	Jolion	Suv	\N
521	484	BAF925	Toyota	Fortuner	SUV	\N
522	485	BB1970	mini	one	mini	\N
523	486	BBB 9345	Toyota Noah	2021	Mini VAN	\N
524	487	BBF1271	Toyota 	Raize	SUV	\N
525	481	KP7606	Mitsubishi	Pajero	4WD	\N
526	481	BAU6478	Kia	Carnival	MPV	\N
527	488	BBA4969	Toyota	Fortuner	suv	\N
528	490	BAQ9249	Suzuki	Swift 2010	Hatchback	\N
529	491	Bbj 4002	Hyundai	Tucson FL	suv	\N
530	492	BBL7112	Hyundai 	Creta	Mini SUV	\N
531	493	BBH1702	Kia	Soluto	Sedan	\N
532	494	BAU356	Mazda	Mazda6 	Sedan	\N
533	495	BBG 1605	Toyota	Yaris Cross	SUV	\N
534	496	baz 5115	mg	mg zs	suv	\N
535	497	BBD7571	Haval	Jolion	SUV	\N
536	475	BBE503	KIA	Carnival	Minivan	\N
537	499	BAQ 4591	Suzuki	Swift	Hatchback	\N
538	500	BBB6976	Jeep	Wrangler	4x4	\N
539	501	BBH7159	Toyota	Fortuner	SUV	\N
540	503	BAE 6288	Toyota	Vios, gen 2	Sedan	\N
541	504	BE922	Toyota	Fortuner	Sedan	\N
542	506	BT56	Audi	Q5	Mid SUV	\N
543	507	BAK 1074	Toyota	Vios	Sedan	\N
544	509	BBB4882	Suzuki	Jimny 	SUV	\N
545	510	BR5659	Nissa	Terra	SUV	\N
546	511	BAR7775	Honda	Civic	Sedan	\N
547	511	BAR7774	Honda	Civic	Sedan	\N
548	512	BAF925	Toyota	Fortuner	Suv	\N
549	513	Baz690	Mercedes	Gla180	Suv	\N
550	516	KS556	Benz	W212	Sedan	\N
551	517	BAZ6391	Mazda	CX-3	Wagon	\N
552	518	BBL6934	Hyundai	Creta	Compact crossover SUV	\N
553	519	B381	Audi	A6	Sedan	\N
554	520	BBL3931	Suzuki	Jimny	SUV	\N
555	521	BAC7001	BYD	Sealion 7	SUV	\N
556	522	11-3-DC	Hyundai	Creta	Mini suv	\N
557	523	BAT5218	Honda	Civic	Sedan	\N
558	525	BAZ7001	Mazda 	CX-9	SUV 	\N
442	116	BAS4722	Kia	Cerato 2017	Sedan	\N
509	468	KJ495	Mitsubishi	Lancer GLX 2012	Sedan	\N
559	526	BAC7440	Hyundai 	Kona	Suv	\N
560	528	BBB4678	Kia	Carnival	SUV	\N
561	528	BAW1720	Kia	Cerato	Sedan	\N
562	529	baq494	hyundai 	beloster	hatchback	\N
563	530	BAN494	Hyundai	Veloster	Hatchback	\N
565	531	BBG 1038	Toyota 	Rush 	SUV	\N
566	531	BBH 5350	Hyundai	Stargazer 	MPV	\N
567	537	BBB4681	Suzuki	Ignis	Mini SUV	\N
568	538	BAK714	BMW	X3	SUV	\N
569	538	BAP714	VOLKSWAGEN	T-CROSS	Compact SUV	\N
570	539	BAY8100	Honda	HR-V	Wagon	\N
571	540	BAJ3416	KIA	Sportage	SUV	\N
572	541	BBG158 	Honda	City RS	Sedan	\N
\.


--
-- Data for Name: collaboration_submissions; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.collaboration_submissions (id, name, email, phone, business_type, message, created_at, is_read) FROM stdin;
\.


--
-- Data for Name: service_history; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.service_history (id, user_id, car_plate, phone, service_type, branch, amount, status, queue_position, payment_reference, transaction_id, check_in_time, completed_time, notes, created_at) FROM stdin;
\.


--
-- Data for Name: session; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.session (sid, sess, expire) FROM stdin;
\.


--
-- Data for Name: subscription_signups; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.subscription_signups (id, email, is_notified, created_at) FROM stdin;
1	raffie3110@gmail.com	f	2026-03-19 05:14:32.269793
\.


--
-- Data for Name: user_achievements; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.user_achievements (id, user_id, achievement_id, unlocked_at) FROM stdin;
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.users (id, first_name, last_name, email, password, phone_number, address, is_admin, points, level, created_at, last_login) FROM stdin;
12	Danial	Adri	danialadriyasmin@gmail.com	989e8a823d8155346506754bf5e907e9a8ed620f4c7a013d37d85ded7dfa289a02bd560525965b6a3eed305fbba876ac53e30b240d42ebf93914761fac75c0c0.dd254ff21bbf42a44796f483cc9d958d	+673 7261861	No 24. Spg 413-61-29. Jalan Kelab Golf Pantai Mentiri. 	f	0	1	2025-03-29 01:30:34.761821	\N
13	Najmi	Jasni	najmi.jasni01228@gmail.com	7be42c6041265a6583be205e6565595d9c875c9347ceeec15224657d7e2d902b126bd36d7f90c46a4c30cf8da0547aa7222c07863a6479cf8e7bd35ffd15a844.11ef970b632ed66cc6bec034a7ee7372	7233628	No. 7, Spg. 8, Jln. Bebatik Kulapis	f	0	1	2025-03-29 01:42:39.923279	\N
4	Fiza	Ahmad	naeemads@gmail.com	593f843ecfb1c7e14b8f45bbd48f20be26dfa71a686039135b4b6cca40d303fabc9ddf413b9598c2167d11dfb0c6ad95bffe7db202d7e53dcd1e0650c55a6c81.a73f9d1cc4870c5571f090c5122667b3	6737113629	No. 89 Spg 89 Jln 99 RPN Rimba	f	0	1	2025-03-17 19:10:02.436344	\N
14	Edwin 	Kuan	edwinkuan888@gmail.com	f0b91adb9af1476109cbd8146efb0f4bba4679e4fec5c24a3a3dd30483c7f6159ee4751368f8503aaf6960fb073d24cd31296e6a25530b8f18c7c3c501e53c2d.a584a47e2fcefac4ebbef50826643a25	7320328	Jalan Subok Spg 160 no 108	f	0	1	2025-03-29 01:46:00.532393	2026-03-20 15:47:07.31
15	Muhammad Adam		cmadam218@gmail.com	16218b45008cc8a0985a3359e1c7fa46bd7ba8e02435a0a8abf4147055b9483ecdd55665dc0ff21ed0d8c3fcac45a2ef0f4654a440420d406aa4517a02618f72.3a00c5e2cf2b2380d31805c1235e19ea	711 9003		f	0	1	2025-03-29 01:59:49.383085	\N
16	Mul	Hj Diris	meld86@gmail.com	92a7994fde31689f26b9960f9ce097d5f081a88b6c72eb1c8c5e1bbb6c2c1d935569136460e4dca9e31a365ee85f5042ab047256782c1314c9b807a14c93d0b8.4dbe95ca1e8fbf13e2cecc7894a62cde	8615846	Kg Rimba	f	0	1	2025-03-29 01:59:56.892582	\N
17	Farhah	Shahbirin	far.shah3112@gmail.com	6d4af7d83e8624586fd8410d889a513488c34446b7f4dccbcf15a761492e8aa53e0207c93457018b8b963c755af8397ce3be4921eb6db4bc0bd9c70dc1a834da.7cea8a4d159f79ddb5280dc3557b1d23	8647378		f	0	1	2025-03-29 02:12:24.609851	\N
18	Haziq	Narudin	hjhaziq@gmail.com	b96dbbe0bffe80d914f8495ebf83c8b709db2c66a3b11beda0b25340f2369b767f18bcc1c7aaa109e943a2b5421b8e94cb4b20b22b4ac3a9b7b7cbcfe84ec2f0.32472ed928f09e8555e4b515a4d47927	7203077	No 15, Simpang 827, Kg. Tasek Meradun, BF1520	f	0	1	2025-03-29 02:14:25.208973	\N
20	Urang 	Brunei	shawrif96@gmail.com	cf617a3217995bcc56a6d131be468485da99b0a0c156cb9fe6b904461a3ddacc410e9c468b121b81c0c6c9397250e202c6519efd8a35c28ea9ba3e8d0d381656.d1e0f2bf05860bb6351702cc612994bb	8155170	Tungku Brunei	f	0	1	2025-03-29 02:43:17.291072	\N
21	meejan	lamat	arash.luq@hotmail.com	7d21d1bc1f157a0307d6efc9414a292c60b74a172020127345805bf946a22029c8e448a8134499f60d997072ea7884356ceed5a06a57e864d869903509c6002c.28c6efc1e88c75948a7d93f584ef8afe	876 6109		f	0	1	2025-03-29 02:43:28.457693	\N
1	Pg	Hakem	pengiranabdulhakem@gmail.com	4a3456d0ea76d27c503c7c0832484a61f23eb64692f1d5cd44715c7f50e9cfd1a5507c564f323160370b6a9859cf58a3a1ec02c94cf848b4ac418e39dd256759.08af1382310624cb751527002db63b82	+6738669378		f	0	1	2025-03-17 19:10:02.436344	\N
8	Zainol	Zain	zainol.ariffin@gmail.com	64d50491e20b710ff5c915936e91227202114b67420771e661ac726ce85947d14650cf421f496187a7733a6bf06406b4a2bb79ce4a47aac4d6e6218f7262a034.0f67eea950a9948f16d65823a0a62916	8730277	No 59, Jalan Tanah Jambu 2, Kg Tanah Jambu, BU1129, BSB, Brunei	f	0	1	2025-03-18 13:30:46.852255	2025-04-17 13:32:45.535
9	Fiza	Ahmad	naeemahmds@hotmail.com	b9544c3a5258ce0253e5e5df04a050ef91a98eedbc8212106e973460d8d20127c606e3461a34088086b361f47fcaba02cb8aa33a01afef52a91a0def9de20ba9.f6e39dfbba7fe1ed43c87d7627e302d6	7113629	No. 8 Spg 105 Jln 99 RPN Rimba	f	0	1	2025-03-28 15:50:48.05278	\N
10	Awangku Norman Haidar	Pg Abd Hakem	hakemshahbirin@live.com	77fcceecee95cac70950372cf27bf6f521e6e332ab236a6e155839bc9b8de9023fa8fe8a3d97843a1cdb6bbc22676cbc5e446a3db6f4c96e56a5815b22f65df9.6086e4c0da2591b3a5e793a5ddc855dd	6737113629	no9. simpang 105	f	0	1	2025-03-28 17:49:31.789574	\N
11	Hasrol	Sabtu	hasrol.sabtu@gmail.com	28f46da6efea83fe2a3518c47232fd8f7558d6438949426b0dcc89376ebe77b5039e4fb0175a97fb3cfb39c89f292fc8e208e1a85f2ba81d8f62d85b106acfe0.3a35b409e70a443a623e999edae59263	8679309	No 8 Spg 12-56 Kg Rimba Jln Rakyat Jati-Rimba BE3319	f	0	1	2025-03-28 23:37:23.228147	\N
22	Saiful	Edin	saiful.edin@hotmail.co.uk	2ee345670535ac1519cd4aaf8d2c2550579cb327b44067dd46c02c6970e6257bb8a55d8e7456345d415ea8cd78f531434702ebdf86bc6bb3a3f3c2633cacc95c.60870ccf6fd40c2a5edf5392fd432d34	8865558	RPN Lugu	f	0	1	2025-03-29 02:43:29.748817	2026-03-19 06:00:00.734
23	Raine	HD	raine.duahim@gmail.com	8613be8a260be279266bc51bad3d20f6971eeb2cb8e053493132447f3c11cda584273c9330693d37a1331ecb875dc7e8e1c46548ecf2b7d4ae4738aacad7cf2b.aec77cd63c6dc2abbe4db9c42b6b35ed	8804430	57, kg mata mata	f	0	1	2025-03-29 02:45:53.172365	\N
24	Hawa	Sanuddin	nhahmads@gmail.com	261de71e5e2db6f1e577b854c7ae4cee3eefc993b9a0db37ca09a626855a02f507205cfd9ca263fa65aa71c05f5e807caf73049fc55af30495a6c1254d3ecb16.dc21bf86927f7ca792877a0e350db2b5			f	0	1	2025-03-29 02:58:28.33354	\N
26	Saifullah	Matamit	nerodmc227@gmail.com	36f919f76490253afe047250ee34bfc692e92b424960f8d158a4fdc31cb2ae57e691a11a5e70c88d32ed43bd210c5c0bf7c2c3f7a3f3408b4df3e6996425635b.10fb28398450385d87113e69e80d6d0b	8815536	Tanah jambu	f	0	1	2025-03-29 03:01:37.397904	\N
27	nina	metussin	ninametussin0@gmail.com	3ff4c70ab0f52d2eb8f3aced11e7ff42a098dc4a7f769f212f02b92ac0e61a6f69545d14bb65e53511cc4531720a6949ae8d24125e7a7ca115cd0866ae5fcc40.f49007ec7879abdd72ea3de4271d77d9	8697900	No 68 jalan 24-26 RPN Kg Rimba	f	0	1	2025-03-29 03:07:08.905076	\N
28	Dinie	Suhaili	dini.suhaili@gmail.com	012589b0f17b83620b20699653a389a61ae9fc74081c623c29356b0482541dcea43f0ffd7893d4278e6b98b7144cf8e4b930992641ef19cda4cf4db85d56df39.da0f085493ef209a679d9dfc06c94e12	890 3343		f	0	1	2025-03-29 03:20:49.641274	\N
7	Pg	Hakem	hakemshah@outlook.com	b3eba500d24190830719887b532aac9293092173389bb835151f4f0ecae8671dfc7d80bb51630fb44e2d807d60883ecdc84ea9469a1c660d2a3f3156f4eaccd7.5ec0ea08501ae4a8f708da87ea2fa73d	+6737113629	Kupang	f	0	1	2025-03-17 19:37:33.729844	2025-11-30 09:32:23.898
25	Hawa	A.Sanuddin	balaghahripahs2023@gmail.com	b7ff047b97d1563e61d4d6184601d5fa264eedbac3e28b4f17aad774b3d7716625038f4013cab2ccaea31ac3364a9565e6ec24c4c56220432514a5a74dbae51f.c3921e21af95f2f9d95134e5e6c8e94c			f	0	1	2025-03-29 03:01:03.850671	2026-03-19 08:02:19.272
5	Fiza	Ahmad Sanuddin	naeemahmds@gmail.com	72565df6bd488448f17f20eccc03151a0aed4daece24fac044cf7019b595b0ce0446fe6bbfe36c867389a829aa5ba75765d431159765a09dbf1337c23883db3b.04b1c6625a263939cdd48acb14f3e624	6737113629	No. 89 Spg. 89 Jln. Dua Berdikari Kg Kupang	f	0	1	2025-03-17 19:10:02.436344	2025-08-10 14:32:01.919
29	Hamiza 	Adley	nrhmzbzlh61@gmail.com	3161730260eaa6f137489e288fe34eda470a368319d09d7a67cbd0d6012bf1ed3d2feba32c89d17a9c2e5ab1ed28c74e9d22a0c07a6eaaf01d43fc7b9e194de1.001bb7fe8419cbbcefc1dee0bc8e0c87	8830455	no.10, spg 708, kg pengkalan mau, kiudang, tutong 	f	0	1	2025-03-29 03:24:56.846478	2026-03-20 15:24:30.058
19	Najib	Jasni	njib310@hotmail.com	892701465593a7aa9c40b2754184ab6e8cb71b3b8eb24e48fa7c5e50df7b09e1e386ebd110cd359131649dc93431b55abcf160716daa9b2789c39441ec51fef9.3852b99f8b2db2a2565fc642afee1a28	7128488	Tanjong Maya	f	0	1	2025-03-29 02:24:39.744077	2026-03-20 06:35:03.198
30	Ak	Hazwan	ak.muhd.hazwan@gmail.com	0459768436ade49d23cd44c4966ed5c563af857692258be569d7f8a449c44f2b2d9d77972817902a7eed254c0922cc3b813c2b1a4373f4bcaabc9416a84c0db5.ecde973db5a440f99d23db3c5f31d2fd	7257919		f	0	1	2025-03-29 03:28:58.099888	\N
32	Russ	Haji Rosli	chikusho_9@yahoo.com	e0b1dd127ffb37f0647e79d168d2014d14946d8072c093663eaf67591f4ba09338232cc473c59f4c40aaf06bdfa247c55ef2cd3856c6451e77d5a461d9e4f5f7.1e9e8754167dcab3158a10a44bca033f	868 5910		f	0	1	2025-03-29 04:01:24.044385	\N
33	Nurul 	Hj Md Adam	minedeebz11@gmail.com	9a3ceeecb641ccef5e3315efddf7eec2436883aa008301d75f0016ac9d925ad7ad95edcfab5efaf7e33629fe2cb5f1a90916394601204ead762884111705ce05.f40997572b994bf15941decdad07b838	7109315	No 9 spg 386 kg birau tutong	f	0	1	2025-03-29 04:16:20.201958	\N
34	Hikmah	Nabahah	hiknabbas@gmail.com	e23b63d961c5077b4b102bcbadd7f4e19ceb01601bcc77e7a1066aefc46040577b0bfdec0e3a63f390cd1866155d30c5d17c21b0fb4f779c9ef107e0aec1d8c9.e4cec35e00581cd00285ba49a164e800	8123141	No. 87, Spg 371, Jalan Bukit Bilid RPN Bukit Beruang Tutong	f	0	1	2025-03-29 04:28:30.932767	\N
35	Khai	Yatab	arifin.yatab@live.com	ee86cc17c7ea9be63d252902117531cbdb11c19b7f59ee55d618e2d6af7f5ae1ef921af76e888785cd63eb8802b39b8cde79a5d00671ee8c25e115a402cb42b4.99ff95c382a642293fbd5e044038a057	+673 886 1600		f	0	1	2025-03-29 04:37:50.629198	\N
36	ikhwan	alit	ikhwan1912@gmail.com	7776c033130e13d096cc65ea08bbfbea1208255b3b3b25c9dc8c76e7a409b931131d76f8d6bd67c7f3e3a1125b718411aaff20b357fe8d8afd31e71e27cfbede.d9ca7afac0366548579b7bafd0aeb28d	8670784	No 	f	0	1	2025-03-29 04:40:46.329516	\N
38	Mohd Akmal Hakim	Haji Mohamed Ali	mohdakmalhakim@hotmail.com	e06280255e0ddc1dab0c9ffbb49cf163d17c14d08b6f4aa046d24dab4c4bbf0c1cfd4ec90fb31b06a4e23048f21c4ccc56f01da3cb87cf93fcf8d4f5706cf400.1a95ed646b0539e1064dd1d84a454433	8961996	No.10, Spg 258-7, Jln Tungku, Kg Tungku, Mukim Gadong A	f	0	1	2025-03-29 04:43:47.797279	\N
39	Hazirul Nadzli	Awg Matusof	hazinadzli@gmail.com	7b37894af0d308deff178e2def21a55f1bbbc5b29a5cb5eb0aa270fa90dcc6687fbeb7f41e0c39bea7b043652445f14c81b46235c61834583f3c36ab7b1d2c42.7685a12d2446b90271a83fb9a8353557	7115622		f	0	1	2025-03-29 04:49:47.396794	\N
40	kamal		hakeemah.brahim@gmail.com	155abac9fbf3ff2eea48b8d7774f33f9c7511036f9b9353193e9ddd185d670a3da1359ac9cbfa983fb29561d0e1c72b81e5256917808c4a9e373eb072940ffaf.dba3611e25341a7c1e0b3f92517cb4fd			f	0	1	2025-03-29 04:57:05.647395	\N
44	Ejam	Masle	ejammasle@gmail.com	39e76de245c016c8aec46fdcbf67088e47cd5e801fc1a3e118ee25b9d34f17258bbc30655c907e51cf06cb8adc3c368d4beb9a8d22dcc8aa1a889fad54a0288c.3d27d3f43613606bda2b2c853f708ceb	7107115		f	0	1	2025-03-29 05:51:01.919497	\N
45	Laynie		layniemushawwir26@gmail.com	8543247b067932f39036f86d8ff151efce297e45ec501f21af1530e87f1ea65ac1554360e35b050b84ef78410b280a25040e3b0ba2c138bb40ec359fdf869243.794eda075f6ec76599f416ad007154cf	8872201	Kg Sibanging	f	0	1	2025-03-29 05:56:28.843341	\N
46	Laynie		laynie227@hotmail.com	8be923e3ddbf567b05e6d1aa97cb82d7c07ba5fc2b3be09b600af8b7b429351480421cfa1a7699828cabef5d1050f7b60ac1264bc5b3f866caa127b0f97976ef.7513c6355a0655c4194b5404b4be267f	8872201	Kg Sibanging	f	0	1	2025-03-29 05:58:13.00922	\N
48	Yazid	Sa'adon	yazid_811@hotmail.com	f34481e20b7be91b40aa98d9c888fd9ca01a8152bfce60b7f6d56824fb0a0422f2d2adec019c5750e122dbde23e1c3dab8dc13a27bbfa0c2bf21d6179dc3602f.2bd3240361a34113c8eb652f5c634afb	8650298	Bangunan Hajah Hajibah, Spg 634, Kg Keriam, Tutong, Brunei Darussalam	f	0	1	2025-03-29 06:00:59.780157	\N
49	Jurai	HAB	juraimah.abubakar@gmail.com	1b5af85188a95aa57e8497b54d84848030fe9f80bc16dbbd41f3b850e7e5f901dbb8167c91882dafe5a02e28c5d4784779f246f649d063112ea2017e35bcf98b.68bc507a09aa25bd8268a44e4d38b90d	8869454		f	0	1	2025-03-29 06:01:04.882131	\N
50	Farah	Fatinah	farahfatinah.hy@gmail.com	70327b5cafdc3682b5551576c11a4b2a0b5e8b5a8731440929b738757bcb6aa9b89e8efa90cbd9f51e7dd601f6919c82f44bddeb48cc7bf7ca74a397154ab4c0.c4bb509ea53c5ab526b3d05e5efd58af	+6737138142	Subok	f	0	1	2025-03-29 06:01:50.772339	\N
51	Noura	Rusli	radifah.hr@gmail.com	012e116563462cc89faa46f8652facb82251e2ec40799222262f4ce3b910f37fa884f57857e0d9e87f513d3c5b8bade102ae5a4a7f37909106a031a3ca6d0f7e.06fa834ada185461bb6394e9cfd60339			f	0	1	2025-03-29 06:03:26.848198	\N
53	Farah	Fatinah	Farahfatinah.hy@gmail.com	edbeffb77c42dcf9441c017568d8910fd20043c398306f20e861f76b7d409eebfc59f9f190a419971f23e2ec1691b09529013df13e7e61d8fb8be01103e5675f.671cc3ac5a7cc8a1c297b0e1ab6b064b			f	0	1	2025-03-29 06:09:01.317968	\N
56	Pg Nurafizah	PHD	dkfizahphd@gmail.com	52e30febf187b42612037eb6b0fe4df8c91119b98a68346f46b62d44ec3add141859b1cb4fd7a7b961a34760c8913bef0853ff9f198c59f011e4c31c7185b24b.7ad4bffb13e0125d1c971f352ff727a5	8721622		f	0	1	2025-03-29 06:45:55.978195	\N
57	Wafi	Rosli	wafirosli@gmail.com	809f1c60106fd6f11fc2368a6257f29af7f1fb9aef8b97c9161281fda67e589be79557c9c585afccc63d29e19f2f2bfc648b8005a2f0984ed0734ac7f00ec683.ad7018de04a8fb3b0a14ea2ef5c99651	8610690		f	0	1	2025-03-29 06:46:22.226516	\N
58	Na’aim		youngmillionb01@gmail.com	ffef239b53f2562f31e90a47258d98dc50d692550128f18f731878c6a5a06d3524be9eb14d80d79f0648ed089f4be5b072ffe80af4481c9efb356a37b011f08e.6f7a90df792eae22ac5b5075563f933d	8292483	Brunei Muara	f	0	1	2025-03-29 06:54:30.581986	\N
54	Savi	Dmv	savidmv@gmail.com	679943a9441b7a0431ae193bbd18b26dd57f48aa8cffcdfde7b850c2b7c2045ebcca72026c1f2c0fb5356afa4c61bd35cd0ea538cb8c491980a603b155ee8f23.10ad4baaa18204ba014c48261c78b47b	8958141	RPN Lumut	f	0	1	2025-03-29 06:26:26.349193	2026-03-28 04:06:51.676
47	Mohammad Ammar	Haji Marali	ammarmarali@gmail.com	ebb77e94fa44d456dd309adaf7ea2f02f9d4b1c31765be8397e1a34c83e165a9a25d9768e14d504dbe51233545057e1f438854001ec8d543925dc38bee39e89c.8171eaaceea4982f3661077c832e6298	+673 866 9404		f	0	1	2025-03-29 05:58:17.232716	2025-05-06 04:49:17.898
41	Fadhil	Zulhilmi	fadhilazib3@gmail.com	b299cc97ba210c6bdc6f725f01d7ca2e8c798de6fb378964d2b1d1e017e43d0175bfccc33e924d3b81d05acc82832631025a5350d4b4a30e23b9aa08cbdb7f0f.4bb3ce0431d63a1a73a469383ca7d1ee	7229262	No 18 Spg 23-3 Jln Tanjung Kudus RPN Kg Panchor Mengkubau	f	0	1	2025-03-29 05:17:56.231363	2025-12-26 08:17:50.14
37	Mike	Han	mike372@gmail.com	2fd489c9a3a39a0953b7f44f9b3e4b47daa43e6550bd38fe6a127528ef10f900c7bf410761988d15d70db381cae5da8b0afdf9893dc13238a693b8f9f46fcd02.b1e9137992be8df2375543ead3af38bc	8785407	No.3, Spg 347-6, Kg Sg Tilong, Jln Muara BC3315, Brunei Darussalam	f	0	1	2025-03-29 04:42:34.196251	2025-07-23 09:02:23.546
42	Amirul	Mahadi	amirul.hakim@live.com	c4e76fa444924f2d5c909e8d37e8be23cd37834892908223388e1ba47734cab833cf2e209dbad7290332c72b76f2cf92e2319d44d8e89d3c058d5549464ef506.ea3ce4355019572e3f6041ba6ac77b3b	8220526	No. 5C Spg 39-60 RPN Kg Pandan C	f	0	1	2025-03-29 05:21:33.783261	2025-07-24 08:39:54.197
52	Hakim	Abraham	alhakim.p@gmail.com	0d9a3c5f762802c3836e8ab315223043e3d008ffd9bb017a5be55b5cc40e22958367d96a3be8e6d1755e3e796b0b9855a6c98ae513a49ea941a816b30708696e.3e771d036972c95ebb4af24018aed40d	8265552	Kg Sg Tilong	f	0	1	2025-03-29 06:08:32.577085	2026-03-25 01:52:46.964
55	Rahmat	Tarif	rahmattarif902@gmail.com	2a03f00711fb0e6f665c13b476a9d817a194ed7f9ee02c85a192fb35ce567b03c5f6a06cf0c5ae851533fd64f764b86299b910b27e5c9b33a6ad6cd51db04c80.4b3a2c3db4418c80951337292ae10a51	890 1433		f	0	1	2025-03-29 06:38:14.79817	2026-03-20 02:04:30.101
59	Pg Fizah	PHD	dkf2212@gmail.com	381ffe863bd7027ea1ded34e5d942602649568da90a6713dbd2d1b8b97ff04fd2658872e0aaa99ecfd1be56a1c8a8a0fb42b6956e7513121cfaa6e61d11415fe.b0694f4f0c1fe3010eaf9796336f6728	8721622	NO 39,SPG 97, Jaln Bukit Bintagur	f	0	1	2025-03-29 07:08:31.375651	\N
60	Khairi armi bin	harun	khairiarmi@hotmail.com	a317def57068b1d71e76810e44c03edf7291ffb126b51af25dae9b7e8f956f735e8c3e48f321acf25ee8ea98cae7cb3cccefee22d619500f25cb19d8333c0a58.69f24152689b3f1582e2a6e417a036f4	8637345	No 14 spg 720	f	0	1	2025-03-29 07:10:20.592897	\N
62	Md Amin	Abu Bakar	md.amin.28492@gmail.com	a5e67d4f53ae31514df1da1b686c1b72c7449518b6a494329a9e3735981a5864058c4cf4fc37244cf8977ab1c1fb9f115298a2c8d5169f5f73d7deaf7485bb72.581c22218fd8e9ca3969264b3422147d	8805482	Keriam TTG	f	0	1	2025-03-29 07:28:36.376956	\N
64	Md	Amin	Md.Amin.28492@gmail.com	068f7b27c31a7ff44ed2a40f2ba20cfd1c56528484e1c52c6840e1f7463831180f03ab417204f75ceb5cd4bf1fe302df64312d4b5ba9fb42bd6502409b3a23d7.59c30fb72e541c726f91c6bf14c9eb93			f	0	1	2025-03-29 07:34:26.147195	\N
66	Muhammad	Haziq	haziqismadi572@gmail.com	176fb2208057cf7f39f24a730c23270a5bb5eb253e1d49c9b8c6f7f870fb7d7d8e25893f1ec6da1d62d2d611aca0ca527d8e528babce828279ebc2a7cd8b7a2e.9f591aee233febcfb2daed0f04bcf3af	8626723	No 16 Spg 134-8 Perumahan Expo Kg Rimba	f	0	1	2025-03-29 08:12:19.997847	\N
67	Izzat	Dani	mdizzat7@gmail.com	27bd3ab0ef395fb62c386519d80c4d7b485e2838b9f1c0dda173d73ce237836dbe1b4535a3f83d6a2d464bcbe2b811288b3a11a95e50e2b6c3634d66f98ebba6.34788f27606282f1e401f28e10643dc4	8234694	No 5 Spg 355-21-16-15-3 STKRJ Kg Katok A Jln Tungku Gadong	f	0	1	2025-03-29 08:16:31.261921	\N
68	Farah	Salleh	farahadibahsalleh@gmail.com	d12484203ded06a98272f2999dace759ddfdc7b82c3d9685f0bc6ff9896522746148f722c8cbc2664f98a7dceb602a8776c42e032877883da39c930d9873d98b.aa5b2400cc181d9b005a057a2561dabb	831 3512		f	0	1	2025-03-29 08:30:40.384432	\N
69	Ali	Zubair	alikataki@gmail.com	d6ff4da059aaa44d5edd757a8f6cce80ac4eedbdeaee6eb59745bebe4ac47d57d567166b340acffbfa9777379f64fd1a9bdc4c15c6ff302c6bd7e8d59ccb18c4.77c36db4ea70a875059d514be309150e	Alibomoh21	No:7 Lambak kiri	f	0	1	2025-03-29 08:33:14.482628	\N
70	Adilah	Aziz 	adilah.syazwani83@gmail.com	24bc1ebd1aa5a49c67623ade514882ad73e2083e4646be6b0b23efb60a19f7b16987f329250c2a0fae51a8b6d973e20c8fdc0a4db0f9cc7991658da204504259.c73b8157823391f814c45ca93b44589e	8978717		f	0	1	2025-03-29 08:38:13.800579	\N
71	Shahizzauddin	Sham	shahizzauddin@gmail.com	d435470099c59ce55dd8f410a4f242dcfd77321d60bd7a000c186f3d99613bca761dd3d7f98d916a2b28f3405ad6c00eb3058a2904be62b7738055bf6bc3d28f.0d0103d04cac41846cddbfa2d9f4fb12	7316818		f	0	1	2025-03-29 09:20:35.753194	\N
73	Syairah	Ali	irahnsba@gmail.com	8d4065313ff1854971831d994bdb8c110c742419f9467923b51821f35fa94f2d470f5a3a4ccaf34ee62321da0e283a56d78a87f86c767246d5a401d9311b3696.c38cfaa616776e16afa896da7d09570d	8361268	-	f	0	1	2025-03-29 09:32:35.82682	\N
74	Hadirah	Mahadi	saaadie3@gmail.com	ff4be78bc5d7d92419028421de0e8a271405e2b3da6946dd45e854560d7ac9d9a86606727738e06ff596afd5616c3701e82bf8a42e6943a18bfafbde50a7988c.c43151627ad2002a04ddba41cd1bf7e5	8227978	No.8, SPG 327, Kg Lambak Kiri, Jalan Berakas	f	0	1	2025-03-29 09:35:34.346149	\N
75	Ajeerah	Kamis	ajeerah.kamis@gmail.com	84a772828a0b3bcc7bb4caa13a67c3402e157b4594c54b7868ae6b5fe5d7182d3888832e23f8d331ed9db3e8a02b8ae6bbee346c8bc777903e58fa6862c4a383.aa333423f85e5cf3115a3769a3415b53	8982427	No. 2, Simpang 92-9, Jalan Serasa, Kg Serasa, BF1728, BSB, Brunei Darussalam	f	0	1	2025-03-29 09:50:13.636784	\N
76	Fatin	Farhana	dk.fatin.65@gmail.com	8aa152c930cd4913e6e80abec473dbecfc5ac8368deb541aa5fdbe51382550a87ec81c2ccb733ac33f506ca6e981d0632553605c538558a44ba1fed17b6e35fa.ed2109e1caf3505d3d6e11d70f1c2c7e	7106224		f	0	1	2025-03-29 09:53:58.278433	\N
77	Kong	yeung ching	yeungching88@hotmail.com	ae82fff4ec2d851d0dd52886c904795760849e65a0901f58469a5eb31b518eb17d2782f88dbd469f104f576ac3b852d4a7b5abeda3b4c85e1f0b98cf6c12cd1a.c965f3d1543f8c27d60d95ca9187d83d	8955292		f	0	1	2025-03-29 09:57:57.013794	\N
78	Aimi	Syazana	aimisyazanamj@gmail.com	d4aa29a6498142bf1d6101651890f32b5a920c783f3ceb2719aea1fc2645aa03af2098507646b703ce50915a97d14648624b8fb5079629a9dcea9f603a3abbb5.41ebf640e26ea2f6d079c6f5bebcb9d1	7289120		f	0	1	2025-03-29 11:00:06.875971	\N
79	Aimi	Syazana	aimisyazana76@gmail.com	1b693655a320fd2b0b7e41a4d278979df5aff105a053d8ad734de4528fa2f7376bc0b0d759c70dee5e4ad9f53d1cef22f23959f39b14ad61a9aeb8bf834ca968.c59441a4c5b430303d6879a5bd4f7c48	7289120		f	0	1	2025-03-29 11:01:00.524134	\N
80	Akmal	Hakimi	akmalh1394@gmail.com	6e2b0193746c10123dd76b90cfb414a09559193ba2194ff6b9ac28d367356f5b4546a56726032ef122d496535fae19e6bcc5a6beafbed30c578af86e64d5d0dd.23b1dddc45031b6e57e30aaa9a17f2d9	7456139		f	0	1	2025-03-29 11:01:38.644349	\N
81	Amir	Hamzah	amirhamzah822@gmail.com	b3df1d95d9ed09f202fe799c5a55c31c30bcf18d97c208237a97237bf1d02666695d515baf1eae45d7950e875f482c0bd0d550349fd4ed8ae0e7b18e6e9a8f7c.b5543e9aafc2b06d30a6b881473d0253	8647610		f	0	1	2025-03-29 11:11:25.377932	\N
82	AMIRAH	MANAN	miramanan@live.com	55fa87696ba9c5b2c9686316c557a096fe2e9575a32b8709b05196f935c55954185ea73e907eff47361e0e518bb10ae243267dc1a0156414008ee1ea371b16cf.4a98f5adfa9a44ea24c33c6bedce79fc	818 4678		f	0	1	2025-03-29 11:54:57.500304	\N
83	Adibah	Othman	hjh.adibah.o@gmail.com	8e449dcc6ac0d90c845c36fb082639c8829748860b80cbbd3ed058dd0672ca0d6c48aba6b11a279b4335b7e67eb42d33e9f4e21796d09994227937739deaf799.5958f355cccde2625f29f4ee9aef8f39	+6738333339		f	0	1	2025-03-29 12:38:13.145907	\N
84	Ammar 	Nazrin	nazrin-hr@outlook.com	aac3d8bc81c20748cf43f7bacf8cb5031b467a2ca8c9791cfb07a1e8ff4436e5d1b867bcd7267dffced3382f20a8b96741a8ceefbce3ccaf83894c89d68b5034.ec28cd5652e9d62adf0cfc0de771ba53	+6737374994	No 19 Simpang 66-19, Kg Bengkurong	f	0	1	2025-03-29 13:00:21.071251	\N
86	Amalizah	hj Abas	Amalizah.ha@outlook.com	1779f6431d93dea2a066709d801791ba85b06316a737dd74852b68220f555eb3e4f7d8e9826b0a82510ad0d17b5092cfde79a4a8374476a3ee3b4186fd82e03e.7f884e199f370c0c2c1fe45f77b93ca2	8174413	no 44 spg 82-6 stkrj rimba	f	0	1	2025-03-29 13:29:46.486729	\N
87	Ummi	B	ummibalqis@gmail.com	db74c2532be5066df7452e5decb55804928616efe3792a17a17036fde27412093a92fdeca23cc5b99ce0537d9ec4b7f510f17313791951c8cfde7fc55546d167.f9069fe30032dad4c5539e761ede36ab	8606346		f	0	1	2025-03-29 13:30:24.931346	\N
72	doppy	boppy	nadzirul.phar@gmail.com	d84f1d131441624c7897c0b9bcdfb338c2ff47385a2d10c296fbd8a8f3c48aa933ccf36cd9babb648e4d78cda071247f524aaf02a9b68a5a1bc7ce4fa31f6d1c.a5123da110b806dfe59e4f8521c727a5	8174447	kg rimba	f	0	1	2025-03-29 09:30:35.626193	2025-06-06 06:00:32.662
85	Daud	Allaudin	daud.allaudin@gmail.com	077dc976ef7eff954d9cc91a5dbd4a93fcf7bd301c3829c253764e9198f4d3aa1e27313ca273205b3a0ef94b2a9013c6966e693ca7be0045aac6aba2213d2ad5.00b68465250a8f0742a062392f3c0dc3	8848061		f	0	1	2025-03-29 13:20:48.21176	2026-03-20 14:38:50.64
65	Afiq	Yahya	hello.afiqphy@gmail.com	4d64fb9f8f8ed582a1ef2100953f7ac1580ec360a9b4830e1716040cb6d524a4b4af969de5c72f4f2825db587df82de5b007f098ed2c9cb2d4ee956dca335134.af743bfe9d08d906346712c34c45c18f	8798756	No. 5, Spg 104, Kg Katimahar	f	0	1	2025-03-29 07:50:14.855194	2026-03-20 11:12:53.73
61	Aris	Ahlimun	aris.ahlimun@gmail.com	03b5245ec164b4f9a991605a15ba9d99596a2853d84b61208be491b6347f8b239f9777dae44b58c9ed5853ceb77e18c3e82f3063149a8b9769f1ae1cba8a1d84.c3726178b4d199dfbda6019ec5d70002	8224121		f	0	1	2025-03-29 07:19:04.534057	2026-04-01 02:53:39.743
88	Shafiqah	Nordin	nfshaaa.n@gmail.com	7c649fb40cae4ac5ce6200271037fe258882ee3e1109482e02fa7b25444c5490c01b45e6d2220653d085d04bd7e8c605af6f1cf435471909ec26e027213b2162.a74f6851abc8bb792c07ba2ccb910836	819 3743		f	0	1	2025-03-29 13:33:58.384835	\N
89	Aleaa	Suleiman	namixrobin23@gmail.com	4748c06dd7347d8cae5071410f7e469fad635a985cf38d1fdac5a93f33b94334ac5e0a92bd0c6fbd2b79252412a1cf34ce4b2cac6985c71450812ec9f33ea405.2b6a5d0ae8a13f87f9a23880f50a4fd5	8123155	-	f	0	1	2025-03-29 13:52:02.006328	\N
91	Mirah	Seruji	umirah.seruji46@gmail.com	6b97fc1d4bf8f4e7627e47c15e53a57d59159e369b7e821256194b289d2774c4725596f9f4ab114209484c5adb42f54007ccbf6d4c37b71c2578a8c984e0dbb5.c0e4d0b58fd028e51351db97fae5cc44	830 2546	Mimi.seruji@gmail.com	f	0	1	2025-03-29 14:45:16.355105	\N
93	Zurina	Zaini	zureenazaini@gmail.com	d03b99481c3daf68da4ee0418ba58a8030652c3f08855c9b55f945ce51737f347be422e555ee1d82f3ac259293c53ee9b855d1d89d54edbbc2636af92a6427fb.2271a50ec72b6c0437e683b4b3041565	744 4594	Lumut	f	0	1	2025-03-29 15:21:01.898103	\N
94	Hamimah	Hy	hamimahhy7@gmail.com	6810d4bc2d5574ccd6835bbeb442dff5433c7026dc3f42a46b9bb16196f93a89cf2bbb8231e3231dbad339ddf408d14c0a85299db7e080d9e444075b1f6ea2de.4b1fdd18dfd4fe75f4f246001e8e0714	7132496		f	0	1	2025-03-29 16:15:46.102453	\N
95	Faruq	Hamdan	faruqhamdan@gmail.com	37964940eeaacb84d94cba656761965c128143062cb503ff48b5193f447ab285314632399b5e0401a8693453e784b06f0f8e645b678bf12b7cfc3a7e35892e93.d517920babbc1e0b177e26f64ccb0aea	8932135		f	0	1	2025-03-29 16:43:18.34477	\N
96	Khadijah	HJ	khaty.hj@gmail.com	dc927d572ab4c9d003962224fa833ad7da067bede2b0f3255f6deb86860ff40b202d0a9182af30e2b3d56ded3e4006aa0842c124f9c7da766e71c4578b80b867.9d3439446dba0e375f1878c40010ab38	8789039	RPN Kg. Meragang	f	0	1	2025-03-29 17:40:45.745239	\N
97	KHAIRUL	HB	khairuls.hb@gmail.com	4d4096a0469693c7d2545865731712a70e5d346d93755743f25247f62c8a214bd62bb2dd71078d332903e8b03e02ae40bfbcc4b18e077e41aedca4bbf2d052bd.59f7e402628d51df8f268dcf0ef7df36	6737174747		f	0	1	2025-03-29 20:48:05.012612	\N
99	Muhammad 	Zulfaiz	mzulfaiz2012@gmail.com	772a88f10e6b5757f746e9a1ce6383e856ed04149cc528f5031aec24b6623200aab9a98a4bc1b6dfa7bec1a3ed77cf05ae7ba5396cf0eed523f2515e25341f1a.206abf086be70ad3dc7add99839dc493	8991481	No. 18A SPG 185-82 KG KATOK TUNGKU GADONG 	f	0	1	2025-03-29 21:29:48.623788	\N
100	Siti Nurrulhuda	Abu Bakar	sitinurrulhuda.abubakar@outlook.com	63585f756553ea55decd6a5da8c9cfe077d83e19c7d9aeddd15c4296cfdb2b1f9072200af5cc557102e63e50f1fc70f0157cf3bea940179390655d73e374878f.e08dd627a22245daac66c2faf9ff1344	7234529	No 3 Spg 162-48-18-29-37 Jln Tungku Kg Rimba	f	0	1	2025-03-29 22:24:26.190436	\N
101	Roslan 	Alli	hjroslan.hjalli@gmail.com	3eb1a0eafb75fed5cb77a1f9c262a5814ba324c010edacb76138c338de44c076b3bb226bec44045bb162177683a5ede27db0e3455e3564efb2cce777595132ea.caefe1efd82dd5e30775c5710c95c6fb	8659674	No 18 spg 1626-78 Kg Tg Nangka BG2321	f	0	1	2025-03-29 23:00:07.764141	\N
102	Hafiy	Junaidi	hafiy007@gmail.com	fda66effc8c39775c0342865ca4349236a8949dca70b4af1f3c954c4510d17b3e3bcc1077acf161acf69a6e99578eec3ebbe12f2307f09b92d701ebe51a06afd.ce103b92490512c605bbb8acf32308ef	7168881		f	0	1	2025-03-29 23:45:02.304032	\N
103	Hafiy	Junaidi	hafiyjunaidi007@gmail.com	cd84ef147346f4058ec9b454df7918b3a60fa9b63267571cce61a6fbda3277a57e44067136e8bf5ad32ee9165ebf5f55e22ffc865105475befc3e35b0d0e5088.d00c5732adbddb5cef546b166f9c7180	7168881		f	0	1	2025-03-29 23:46:43.458335	\N
104	Fendi	Ariffin	FendiAriffin242@gmail.com	cd29955517126375b614b809259e657ce02ded1b3cfa49eeace9db6471436e23aa3951a4399d16fc24e8e596f341653165f38367cca15ed056bc03d01100b9ab.107f0715ec658857545f033f3ec2a7cf	7355790	No. 14a, spg 15, kg kiarong	f	0	1	2025-03-29 23:48:55.957927	\N
107	Shukri	Hishamuddin 	shukri.hishamuddin@gmail.com	b6e2f41cfa3b39ece1674da3a9c3404f40dda46675831cee1e0b7b50484b9feb8255bb728032ecd81ad01b5f29a962e53075a91e9110a255a0141fe87dbbb4ef.de98c2e4457f515dc34edca6ace29262	871 1631		f	0	1	2025-03-30 00:46:52.349797	\N
108	Munir	Ibrahim	ahmadnine5@gmail.com	0548a04cf149adc45e3642e728617a25212adb6004af64c3251c8ca392a2d350d22cf0cb2fa43c527111724d16876d531b2b6b0323b0dbe09422f4f997fd981c.2c20cccf616870750ea53540bb28eef1	8286367	Kg. Petani Tutong	f	0	1	2025-03-30 01:08:10.608398	\N
109	Farhan Murni	Murni	farhanbhm@gmail.com	a198227085b3419a96db6838e7f2fa20bb0d5fed589f54f3970b7e812c39776692911d0e0f588cbbb7ab76757744eaa6bcf5e909d7a236dafb14fd13d211b781.8466672103635f5d9397ee01c124a5c9	8362212	Bunut	f	0	1	2025-03-30 01:17:56.857919	\N
110	syahirah	msa	syahirahmsa@gmail.com	8cb80a5e4fa14eda37a24aa40b0768da0441e34c498e02d4ae5b6767be9cf217a0cfa16fc3a6908ab43610b821ff02464bf1f97fbaf5be73241f6123264d5ac1.aa5edb4d91f24216102bddb73d6d5fb3	7284826		f	0	1	2025-03-30 01:17:58.799547	\N
111	Raihan	Ghazali	rnghazali@gmail.com	5af3b5ddba2092a902f7e055883e3d55886c00a7fdef5b8c6766cfa8dba69661335235ea2df1431d601855a9b7cc047d72be0de1c0b70075df4e4a49d79bfdd2.1bac6a9a9766f95484539b8fa383857e	7218121	107 Jalan Hj Halus Kg Bunut 	f	0	1	2025-03-30 01:37:33.415921	\N
113	Ramizah	Rahim	rsyrr9@gmail.com	15eb4f755b769becb6aa457f6a5278d2d12d5b03d6e6910a765481a3d73a06e3b0e3795565683debbef33423adff0c821d2ff509bf8ce82773f98f8e1d008205.97608a1ba99d9eb013a4f84dc327e53e	8869709 		f	0	1	2025-03-30 02:06:25.52135	\N
114	luqman	syafi	luqmansyfi118@gmail.com	5a2592a3a63dff767c9a0c0957673596a8694e3bb89049dbd7c7280a2c7091f76b6cabd71f4c44fb18d81956729c67297777259483b51121195cd19d60f1d3ad.638398f74be785a6390efa31ed7f3560	7370806	no12 spg 35-10 jln 99 lambak kanan	f	0	1	2025-03-30 02:19:25.348136	\N
115	Maisarah	Jamil	msrhjamil54@gmail.com	45a3e573e15c2528d52be09cff28c462adf4e27acb2dd0924487fdf5196b148f695e44d0641f3f789b60650e24555c49242f8e28524ea66ab76801251b90d78b.10ee021df5bbd74d779cf634e88e0989	731 3680		f	0	1	2025-03-30 02:19:30.479731	\N
106	Ade	lee45	saifuladleyhjawangkanak@gmail.com	83f65b192fd3549145ab9a6f0c619f20460076f17470d34f33d3b6eaf57f1d5f520752702c64a350b4fdbffd3358962186bb56016ae1cdfa030f041174d68fbe.4bd3b10a8fba167cdeebfa93d6da5956	8879756	No 89 spg 89 kg kupang	f	0	1	2025-03-30 00:41:00.924664	2025-05-04 07:20:42.32
105	Azhar	Farid	azhar904@outlook.com	1e5bf9b7da927ac5a097e7f04705145be76fac363a14d7bc1487a3da5f11580793d5f9592a628cb84be8504c871eedff3b61cf63d091a399fa386509ce36d609.e56aa0943c7df1adf7ede3762bea619a	8245259		f	0	1	2025-03-30 00:38:22.967733	2025-04-29 07:29:14.615
112	Hussin	bin Jahari	hussin.jahari23@gmail.com	226392f04a8f4163742d4df2717ce782a8307ced10c68f43019a5ea74b604318d9f5a3f54783a7ed50997c3cae614f8a4c3023f1466843e275d33d591bc46535.c4674cd8ac78c426ad3d4814ed2c9bb1	8723125	No.872, Jalan kota batu	f	0	1	2025-03-30 01:45:44.715419	2026-01-22 02:58:33.171
116	Nora	Haji Adnan	noraedoratul@gmail.com	925cf428f50e5dd0b13cac20f211c038a5138c95842618d9c7e955d2ccc71a50cbe6ed589d453d2cc802c6daecbfa57b6a49fd1a7f129118f54296ff6497f8c9.f6bdae468425575d5890431653ec1b7a	8250811		f	0	1	2025-03-30 02:23:00.706283	2026-03-20 15:30:22.078
98	Haza	Hhh	hazel22moi@gmail.com	9f1c8c8f9541dbf001734d406d1ff2f03e6f508582a8ad468f7b356b765c7523d4413931a8d665a0e19b8be3776e99dd3c2484e90320518d81efdebb92b738ab.0f6cd05c71d42248e7791ee293d66365	7258869	Kg Panchor Mengkubau	f	0	1	2025-03-29 21:02:32.543747	2026-03-20 11:32:16.632
117	Ziemah	Hm	multazza36@gmail.com	4d944ac5c12a6d9dbc1d322b5f8ed7d0f9c88364b1904504602bc8be62a74375769b9e6624457ea41199c4ecd0759aec1c1a8149924fc73b3b4db91bc55fda21.6886ee06c852b2cffb94c4a0680fdfd3	8268136	No 4 spg 1266 kg tg bunut	f	0	1	2025-03-30 02:23:47.856509	\N
118	Murwardy	Mule	murwardy_dee@hotmail.com	df23ebd7a3e2b59aefd05d1ea44a5490f2eb7c256dd68cd8cdb98b3cc6fa09df75b12c66f90f81281917fedd55eb4306a93f816b2e8981b893a2f6b82c30801a.2201dcb42a01db719cad05b34549a06c	8935600	No 10, Spg 359, Jln Bukit Udal, Kg Bukit, Tutong	f	0	1	2025-03-30 02:27:04.056492	\N
120	Muhammad	Muqri	muhammadmuqrimuslim@gmail.com	7d1cbafc45354f6b41de6ba81cfec69729edb1e1175b971097e418da98784ee5740da9645064b4c78065cdac8cf67a0519c538546eb11146bf41b1edcaa8c262.e25294ee469bb519eedf8ba1478b4fd3	8293997	Tanah Jambu	f	0	1	2025-03-30 02:36:03.46899	\N
121	Wafi	Morsidi	wafiwee@gmail.com	6c529e2bab44f76bf5d0f39651147d19a0cd5d55c0188ef012d096556c3363a3f82ff74bcc89bcfc440cc9806c409c5dd97b027dfd8c2eeef4404424f8ebbedd.bd778e53e1190b333fbe77e876ba0701			f	0	1	2025-03-30 02:49:43.754143	\N
123	Farhah	Shahbirin	Far.shah3112@gmail.com	a6f2b1b3c9698e4a6ba81dfb6d1a779ee22e2632ef29807e170da5bf08f0b0b61f88c4e154d0d2d703c0693c4d46261d24a737f89dbe47f78014ab57a1a69637.4ae8eabaf9d4841d0d6f738ff8ac5cd1			f	0	1	2025-03-30 02:56:19.38577	\N
124	Addyrul 	Rahmmat 	addyrul2517@gmail.com	fdae18668cdfa1dc52e70f57bcd706066de68da5a1c1b1b7920808d3dd8e0e105c3fb44ef5e056aaace5d11cda26535da553dc5bbd2205c2d84c7b21c4ffe1c9.32aad4e9ef673361625eaa2128f44b8a	8716301 	no. 7 simpang 212-12 kampong Rimba Gadong 	f	0	1	2025-03-30 02:57:08.575479	\N
125	Diana	Z	nordiana.zakir@gmail.com	1debd82c088b02ea040c61fc8a3c29c4afea8113f6bb02f53e3c83ff4c23eeacc9b5edadfab02da7c21b299932ff947466e70fdb04c1cd87925a1518b8e8cfb5.b30d8fafdb546736976e1f3eff6b6154	8888172		f	0	1	2025-03-30 03:05:17.455519	\N
126	Nurul	Yahya	nurulakmalina.yahya@gmail.com	21604900994de5a4bc037feff7f7cba60220415017ec1397fd2774abb480ec6da1bcdf958c6aa9da7d5770c7be19d8c7c9998581e8237c6fa5dc3d2f6ee1d6e5.a7208e176e4e3bb9cd5a9f4c354e3643	8615034	No.9 Spg 801, Kg Jangsak	f	0	1	2025-03-30 03:10:44.906655	\N
127	Huraizul	Abu Bakar	dexluthor@gmail.com	34fe96ca9820bd378bb749dc24c37d465f339cd3bb4738720c6699975826c41b890d56274953d61a2b34887f47f996fbb4a9206868d3ddb07215d41429a0eb70.679b618ab747101c8b7ccb194a282721	+6738881309	Katimahar 	f	0	1	2025-03-30 03:13:04.117022	\N
128	Wafir	Ahmad	adeks506@gmail.com	975c35d7d66b47ae131fdfa6dc68402d0c0ce154eb5b22fe070793cd9ab1856dc8289b84da73ba65a8179cdaed409859e40c47f30b37c4edf06eb516f355849f.e1af599268e83a99e3686cbedf0b92de	7129853		f	0	1	2025-03-30 03:22:45.582602	\N
129	Izwan Farhan	Dzul Isham	izwan1812@gmail.com	51b3792d3fe6314473a9478a9aecbc32b533bf138c3c4f2ea07101d494318314133a328bf41ddd2125219264f061abb1fdfe0856ee50eb1a8ec239736396e108.9ed380abf4d7200509a142546c24e90b	+6738825907		f	0	1	2025-03-30 03:23:10.45028	\N
130	Wafir	Ahmad	Adeks506@gmail.com	baeeba7b635958d3726dfbafbebf30abc1f4ef9ad298db02afbe9d02528fcc55cf64717bf66862653f6f288ebc74b3d3f95f4f0eb4f6475dd5314eff4dbee607.3d6ff9104102983b1cab8bb3934dba6e			f	0	1	2025-03-30 03:29:11.166517	\N
131	Muhammad	ALi	alievo121004@gmail.com	e610adb085216eabf63c2e5eaf1adcdc7870ba747bd7c6c77ee22a84383565cea2ee69b85439d9487475e66ba63d8dec76a160b2694670b6f1c095d6444e5694.a1a70faac481d43c4b8711817df8be26	7469769	No 5 Simpang 105 Jalan 99 RPN Kampong Rimba	f	0	1	2025-03-30 03:32:23.55453	\N
132	Mai	Hijrah	maihijrah.aji@gmail.com	7f2b506f7307107719b5c3c05c1e7aae6813c0740a86af64be2a78bab8c286d1e00eb85d0c132676f95906a8eedf83950de1c2fc35cbaadf3b83dc0d37cfbfb4.ab5fd2cb526b40fbf09fc5d75eda90d0	8792516		f	0	1	2025-03-30 03:34:59.712625	\N
133	Adele	Hs	adele2284@icloud.com	8bfbbc657e7107a64a9f3ef36c32c7d6ed9e0155c8f296e48ef903768ccefd7f476d4ecf1bafddf2cd4324b8983798ef302ed354a8623a52022818351c547b01.43b5bfd806d0b455a1afbd57ed52953b	8863765	Tutong	f	0	1	2025-03-30 03:52:08.108675	\N
134	Hafiz	Shah	hafiz98shah@gmail.com	77463006fa6f0a05f20af6601dca13d43e9f6aa211acc27ca5aaba195478b69fc3521dda228ef528426f8f443126e5c481f222c995d95c5cdf8f9c44bf96a0b2.a541368f79b23ec995eb161ea9e31446	7319997	Spg 75 no83 panchur mengkubau	f	0	1	2025-03-30 03:55:39.768972	\N
135	Pg Nooril	Haryanti Aries	nharyantiaries@gmail.com	eac1fb3df312b6ecad0c79bfbd6bee0ae31c725517bddff96ee4376cc769a57bb4ffc424ff49bfcfaf3d23fa2631053644566a537f718bd9fa5c98b4384f9de0.d08442db8ed005ad2aeee545da9210f3	+673 8184669		f	0	1	2025-03-30 03:58:02.963985	\N
136	khairul	akramin	akramin.k@gmail.com	3b56740cf592501aa8b0e072f90245d734a046700e5f1b8c3c6664c3c8b4dc6f9f13aee800c5f218abd2ca48b979c31c2f07853aa3311e6106095ed1e54a65ac.6a585af7939d2ef16cc4f9dfc482a338	862 3085		f	0	1	2025-03-30 03:58:28.667227	\N
137	Hafiz	Shah	19hafizshah98@gmail.com	bc744878b408bda642238fa9d415ebda510c6004f2dbfa57a45e6d5c3c494ceff36de675c13113ecbc5c8e069fb0c26149dfa3060aa230860f8e90a0e5f47907.0e7f79463bb68842b90ae44309efef7e	7319997	Spg75 no83 panchur mengkubau	f	0	1	2025-03-30 03:58:31.708373	\N
138	Y	Yu	amanda.qaf14@gmail.com	5bb8b5ee9a34e20722d3d29c3087be3f3ed997e2b2da11d6d0ae3238b7e9c21cad6548e10fc445d67513ed628ca0a68dbb2c860eaef9648200bb74f752062d4f.e890bdd0b373f412085afde2468918d1	8196608		f	0	1	2025-03-30 04:02:15.617017	\N
141	Sabry	yusof	mr.chica.sabry@gmail.com	693d192da07c025e86957f1ee3f713d6b85ea5e12f00e49e3c7e6e23cacda921c946e00c7568797efd883fdab939eef68449dfc740305c3c679ea7eb178d0b71.803701a9c4fd31bef959c272fb7c3476	885 9718 	No. 8 Spg 118, Kg Kiulap	f	0	1	2025-03-30 04:20:19.401622	\N
142	Hakim	Abraham	Alhakim.p@gmail.com	0e474da148c8ff65e9d812a0095e1fdad0e2dd5d3c14e444a205f070f36498b61768e91fe865ff2628fdcf950b55e372009c79e569cf97e019cfa6d4bd7326c6.b54bac80edaac86a29c0b26a43e6c7e8			f	0	1	2025-03-30 04:22:14.223016	\N
144	Aisya 	Soffi	aisya.s@hotmail.com	4d4883d5a20199b8c9c99bfbadf4dc4048d7945ace80f29fb663989aaed68af84c9a585b5bcdc8c23e7b6dc3948f0a8b7acf97817f88f65900a6433e2feae5a9.51c8aa6bbae74d77cb6024c05413fce9	8966869	Tutong	f	0	1	2025-03-30 04:36:12.106201	\N
145	Ameerah	Miza	ameerah141rosli@gmail.com	60e6f5a7f9de4e640c187eafa65920532382ed9ac0a2689e7ec3beaca11d6dfac19313629a6a987d434e610091db80fad8d9307da3cf572c0f2c00bf89f28702.ee1cc7d01304cc2a20559a353d9f258b	8218141		f	0	1	2025-03-30 04:38:05.975773	\N
122	Shadrina	AT	srenyu1618@hotmail.com	bd1c1f92c2d9a6dca93df59fd057174cb2373a52a92bc634bb76109af717891d457f6237bfd34896ca0c10310808fb711cf26238ac10d33797bb847de774af94.fff628e0cc280b28d1562a3e06917bc5	8843729	Penabai	f	0	1	2025-03-30 02:52:01.461301	2025-04-28 00:42:15.126
119	Dirah	HNF	hadirahhanafi2@gmail.com	9f716a60e12504408eba6a30b253bf1a7c328c3d04c38c801aa2288673a4e4b0b5d456c0fc81b1d48cb6cea7e33359a564a6398f0b1e92663a5ee91ab13b91d8.93a238893642946151f78a90fedac110	8956216		f	0	1	2025-03-30 02:34:13.325472	2025-08-30 09:36:37.326
139	Amal	Najihah	dkamal.2nd@gmail.com	62c683f83b4f75b3fcdea204dde2100e58e91529da8100ff4bd6f8ef8aa732510818fb7f1198c1e657aee9aef3bb107aeaced67c38895db99691eb8ba9dd4dfa.a348edd0392aa23923d3e3c6e14281a6	8674173	No.12A, Kg Bengkurong, Jalan Bengkurong 2	f	0	1	2025-03-30 04:15:28.350724	2026-03-20 12:50:07.229
146	Weeyah 	Halim	weeyah17@hotmail.com	6e1696d1e2a2fb25f186cc7bc8f71c468c6713c876852c813c0210d55c82ee88e2dcae668a7839561f07b686ef98461804b562c47faf79a01da52e3eeb78d491.dd193d6f19203c1d732f118455ce87aa	8221777	Kg meragang	f	0	1	2025-03-30 04:41:07.683283	\N
147	Azim	Mutalif	ajimdanzo@gmail.com	a0226c55dcc8f867c631ae334e48db4bac56c6299b950493398234f247e726e1404bb8519b1a1fe6fabb4a1907a676cb35f94b7d0ea3e48bef9bb53f1ccfe93e.c04dae24cf9eb7a79203766fccf85c7b	8288526	Bakiau Tutong	f	0	1	2025-03-30 04:48:52.104066	\N
148	Alif	Mahdini	alifmahdini23@gmail.com	4aeb706ce7adcf11fbadc5f508895d56682666862aaaf2a26ea1f2755c872f589ce668ca9a909397c50be54ceaafefbdaafe2cc2e07377446f08ebc4aaefdf4a.792235e412a05f4a4092bcbd0df4df75	8926342	Panaga 2000 jalan kalajiau spg 24 no 4 KB4533	f	0	1	2025-03-30 04:52:21.288152	\N
149	Fuad	Raffi	fuad.910@hotmail.com	1e2bcb950334b013f82bc55fdd0ba891ccf43f7f7e7f5e1a043dd7f6be6d1c5f147eb60056248547086c991da03aca8fdf4d22e9022cdbf1a2436080a3f9a08d.cd930f20bf317d3636dfda0df7095975			f	0	1	2025-03-30 04:56:26.318011	\N
150	Hazmie	Hasni	haz_@live.com	b71fddccafc9fdb529dd04892fe082d2aa46cd6cec223836ecb4a7f47abc7488c226874d278fd67f5805f9fa3e341a1e2a20ad6ded902b79af1ee4b7e5fc3fa4.93fff586844792b8489558a8085a62c6	7297727		f	0	1	2025-03-30 05:02:08.934648	\N
151	Zirah	PHAS	hazirahphas@gmail.com	3f3d72ad8e646c83a62ddb3b6a33f9a81d629baf938212b6970a4313e76352113187c793d3146a85a340e52480b12b0325aa2f2a62d6f17f958bd52353aaf9a6.9720d1da8feaa474d8437370d5def793	8960381		f	0	1	2025-03-30 05:02:57.231995	\N
152	Aida Nadhirah	 Zaki	aidazeck@gmail.com	7607f04c2584816725cd4f30df4c657463e60212a7f4c6c638b5d2a80609ec5acd1fffb4f5edec5ff53ea6d73b2b7e9120eae52de1b55f754a92a031560e8867.33b642b4e139d937897a61faa252a7c6	+673 714 1131	Kg mata-mata, Gadong	f	0	1	2025-03-30 05:11:25.743933	\N
154	Hj Mustafa	Hj Sulaiman	blmsl7@outlook.com	bd1c930318fb4dc194ba1289901cc1f5cd43ae2bd847790a0f8bdcb42d3cf29405b009ccc392336964c63c02bb9f62b3af11f797a7dee9bbd11a6e15d97aa3c3.e1fa439720d412c5982330cb6deed576	8819213	RPN Lumut	f	0	1	2025-03-30 05:28:57.775208	\N
155	Adam	Fauzan	adilah.18@hotmail.com	c8513b5bd839ba48c66dc8193e01e2e0d448372a4f979ea6d2607ad40748e0e00aaf671bce50e29013936f75411519820d0b17cea5ad10738142e7469d90d4f3.674c4bf30a000d239781eff17f1f13ca	8881799		f	0	1	2025-03-30 05:36:59.739281	\N
156	Iskandar	Shahminan	iskandar.shahminan96@gmail.com	f544277c8a49bde82faf47840defbb52835e239a13377f2315f11e6c998802318b251201d27679cff0ff41c480156c85680d94778f754018fe2e2d00a508184b.88f93e7349bf58139f90f51c3286403f	8999696	No 2 spg 367 kg tungku	f	0	1	2025-03-30 05:55:36.909548	\N
159	Syifa	Takong	syip7074@gmail.com	9259345bbaf286d25373a59fe4bafdb5ce7aaef77c9b94bc6314d6621e8308512ba5a4e90595a2dde30c8c094bd5eaeca19538f013b3824a7d12766561bb7892.50c335102fb50e38dafb6b1c50868c73	862 9305		f	0	1	2025-03-30 06:11:20.460697	\N
160	Syuhaidah		nurultarip@gmail.com	eb1b0bd0efb495ab7f594715d52e3a89f449a3ecbd951ff754269dd0b27d37240566cc3ebaef972fef95fa03db5914037f5c43618c0c3bb96e7e28a9e3550c32.349b51052c259fd1798c5b44a286f5fd	8993043	Lumut kem	f	0	1	2025-03-30 06:23:58.021788	\N
162	Khairul	Safwan	khairulsafwan118@gmail.com	8e9b83a6c017bc83ccdf1ce3408f6ad29f41bf02833fbf0f049da1e870ca328bbf41dd1ac76d137515ca9b4654ee8c6137176b6a92636600b4ffa6bdfcc87578.a6253e6189edcf9812c18af9c8540408	8809545	No:8 simpang 66-142 kg bengkurong	f	0	1	2025-03-30 06:42:36.034544	\N
163	N		ain.hnhmj@gmail.com	e6d7c72bf1a49b9641d3395076a573f0d646de967a42b8c54a2f8568b5e84989caf8406051e0d0321fa1aeec6e96578236a6d660296b0b0d9811a67ffc9cee25.c872b4ae2523bcbf453652eb228e5273	8711996		f	0	1	2025-03-30 07:01:06.10928	\N
164	Mona	Nicole	dilahhisa@gmail.com	5cee8191b4102f66642b13fc1b0e31ff42ef74879d905c59223e24eddd343991c981f770b592360d6755873df519d47c53a0a267ecad074f0d0156e6dc823725.c309dd89fa09bf7d59aab6d42bdccc45	7378584	No.1, Spg 52-55-20, Kg Mata-Mata	f	0	1	2025-03-30 07:11:21.726436	\N
166	Marhazwan	Ali	mar8288122@gmail.com	ae4eb93ea47c7349e2df378cf92934b9f26e0f0fb18f5dc627a46d4f3f5155e824416fd957abb8d4b626cbd6899477482f171b344fd71de1a171f60cc4a598a1.640e06dfaba2e73c6ca1055db484d535	+608140802	-	f	0	1	2025-03-30 07:16:45.316928	\N
167	Marhazwan	Ali	marhazwan812@gmail.com	cc3dda0e1b824eb2f8b70723bf9e9dd7bc6970183a8aaf29034ade4e4e4065c1fcf264683cec1b3841090d747410aa79929ade78c87878f21aafc32134db4ad9.10988ec3e705796c3906a5c30468f6fd	8140802	No 20 spg 30-5 jln wasai limiti barat rpn teres Tanah jambu brunei	f	0	1	2025-03-30 07:20:03.544156	\N
168	Nurfatin 	Rozi	yemzhhh@gmail.com	b82a9ceeb4835305eaf6a5fbf9f7d1441a1f04794d67b75555ffe7e6e8d9d630dd5a55a9c32c64dbffe5c1deda5c56186e8ebe155072249346b78635f59ded99.ca1de923964972e578c1155b55103d04	7314267	Lambak Kanan	f	0	1	2025-03-30 07:26:04.940542	\N
169	Yung Sook	Sia	yungsook.sia@hotmail.com	475d3486c652d413abf9583f1dd45a24c1e23309115b81c41373561b7777c4e325135f5775504aeb6183238761346fa195562b96896fb29d07fab1f88f941919.e1bb4585087ad46f8a0606f4cbb95172	8244036	Tutong 	f	0	1	2025-03-30 07:30:53.676745	\N
170	Saifuddin	Shari	md.saifuddin.shari@gmail.com	eb836812877534d722d30c3d5cb840d07e1e03cf511366047a697c4759e7e0763667555799220f4a3a2b2e67cd3380516023cf649ce70ffbf189169986e66a8a.1b870fa6d7503b2f5e4c93ad3dfd1177	884 7605	Kampung Rimba, Gadong	f	0	1	2025-03-30 07:39:36.190168	\N
171	Afiqah 	Eidi	afiqaheidi@gmail.com	18657fd43947f2404b02a103e4c3544fed390863fae9da820f50487fd21bb50f1ada313e7c6e03158566dbbd5b7712820d69de0f7348479508ccb303016db2b4.42845b7c382839538a4b9dbca83c6c0d	823 0674		f	0	1	2025-03-30 07:39:52.628977	\N
172	Hamizan	Yassin	h.mdyassin@hotmail.com	3130927f06ffabac4f77bc1d15ffb4155838f9b6d13be647076ee6e41492f6903366bd1e017b1a5dcb2bc4f8ca4afa46535e1b0ddf9da4bf6907d7bb5ed66bdc.fc92e3ead1862b35539d6e049772ea2e	+6737141825	No. 14 Spg 114	f	0	1	2025-03-30 07:42:17.644444	\N
173	Yazid	Ibrahim	zidd.ibrahim@hotmail.com	a440b7c282fd7250c9b47a8aefba7b6b1b101e908abbf33b592dadbcb166160986a18ebdbd7d4b176eba4ef738eb6ddce220a661a69602a8a3a48da89d28f32d.677cd9ea7c111e89e77324cdb82d2545	8975160		f	0	1	2025-03-30 07:56:19.989164	\N
161	Afiq		afiqqsmith@gmail.com	9d87b40d8ca4de19f7aa4965597dee1ae76831fbcbc6aba74cd11aba76bf78e792661aba6f789ed29c6bfe3a6a3fc58570579cbdb6f88ccf0ff8bc5249594e5e.a8493acf7861cd94a3b03762ff3f655f	8790994	Lumut kem	f	0	1	2025-03-30 06:28:39.196087	2025-05-01 11:55:19.939
153	fattin	farhanah	fattinfarhanahh@gmail.com	887771437932a472e95a8a6063cf8bacb24e0e8ef19a5dafef52e0969f207d31d2ced9935c207ef87e39633c8a9ed08ff088378b816554773f5d989f3b0ff268.2ffb251720b417fdd0f1581f30907d52	8973606		f	0	1	2025-03-30 05:12:58.724576	2025-08-01 09:35:11.208
158	Aari	Othman	iamaari27@gmail.com	98826153049d2f9d3004f5710a00efc39b24107c18dfcfd53bfbd1e07a1c258ce259c5081e9da7c627a51a5a866d3a59cb6a96af4ff4b2263fabede634713a34.b4431d28dcd80b5c2264dd2058b69baf	8167232	Kg Rimba Gadong	f	0	1	2025-03-30 06:05:43.624554	2025-06-10 09:23:12.272
174	Amaruddin	Marzoki	amarzoki@gmail.com	82d125b0eaebc3fcdf7c01b87a282c53e83f7692552763b9cedefbe279bebd98bb087cc3dacf07da00c56771d53fa29ca1599e7156001aef836aaa2297c77044.b47d6fcb5732218782533b564e2dd9c9	8621305	Tutong	f	0	1	2025-03-30 08:08:10.713851	2026-02-08 04:11:47.795
176	Syikin	Mohamad	syikin.hm@gmail.com	9cdacee6cf89e32fd02c2f32b91efa9804f5763e9de53561bf0f4c709a8206ebeeb1502a0809beba007e19c34169a18fa61009d0a7e89ee6b58764c5532a6c7e.bca3b0cedc4d20361ebae529285b0173	8628278		f	0	1	2025-03-30 08:10:44.858413	\N
175	Pit	A	mdfitriali@gmail.com	9cb094ff22c6c55a656106ab805690bb549ac324bec203a4aedd8971a4a08affcbd83618112ed316150fcdf4eb775d9d349d6cee0704a009539c577ba27a080a.62aa37d57afb1591472b352d5375e1b9	8904003	No 21, Spg 1973, Kg Junjongan, Jln Junjongan Limau Manis	f	0	1	2025-03-30 08:09:18.046535	\N
177	Faiz	Shadiqin	faizshadiqin23@gmail.com	88907633c4b8c0d6180f630bb743af91ba6a03dc7a2426dd106e77eec1044ea228a941bb004834d75a83776d8afe25b1b80e9bb31fa16fc3e732adcb6b893ec4.335bb4052ade016f8eee8b65ddb444a8	8814947	-	f	0	1	2025-03-30 08:26:08.918699	\N
178	Ahmad	Rizaldi	rizaldi81281@gmail.com	45a29f61d33600c09d19aaa7064658ff71fc4501345efd600ec5cbcc06d2b0a97d96cbf6a86f17129ce94dc8c4766c9b3fdc3ef6439612f21c39b7ef9cbd11b1.62b6cafb05a12ae535fef675ca7df276	8862917	No.48, Kg Madewa	f	0	1	2025-03-30 08:34:39.789026	\N
179	Izzatul	Shahri	ning8510@hotmail.com	4dfa1e0d6c57859f9cf2876c4313cdccd2c99046783405e037eddd99db368a403a158c6f799f9adb51e0a7eb9c0ad456db70b7d3acb7787eae5beea2c999576a.b99b3d07a2b88e2d190c6b1a683b0a41	8678862		f	0	1	2025-03-30 08:50:42.291086	\N
180	Liyana	Z	liyanaicebear@gmail.com	11ab8fbd8b187a169a47d2421fbe280ee2e3a9c391924d4103470b3da6f2c33be10ea09013116edecc3af7e1cb20ea6afa82621bb585cd7b5e5a9b0132a41418.57424e1e52e6c87579090702e00fb655	8650455	Helo	f	0	1	2025-03-30 08:51:16.97497	\N
181	Izzatul	Shahri	ningsheh85@gmail.com	866cfcbea7eade38ebe46f99b1c564d50053d8ba0ac752fdbcf221ec23b647e4fc3d315a327eece9bf66835badba9721f3ae526992503c3d9d1647283b64aa7f.e315cfdbda9652ef377b4640c7b125b1	8678862	Tungku	f	0	1	2025-03-30 08:52:48.855693	\N
183	Azirah	Ahmad	azirah.ahmd@gmail.com	1b1e633c79d31cc65754c443df14053165a6d8589d34fb76c028b615bb0ff1f7adabbb45d550e1238318f44632e746849bec9f08ae1ce64de6a1490ddd7b1d9b.4c45db7865f7e1d018055ba456df186f	8920940		f	0	1	2025-03-30 09:25:16.80689	\N
184	Izzah	Sahit	izzahsahit@gmail.com	e69fd81d0aa709e061ce2c8a3484d6781aeaf71d4bca8d087b7828f1e5ae12414af548b137507e9b6c60a870d338c4e5f7b5af048b88f623481bf5d907eb3a17.b4c01160e22bb312eb4cc4bb88b8ab5b	8301081	No.30 Spg 353-7 Jalan Paya Namurai RPN Bukit Beruang	f	0	1	2025-03-30 09:25:32.104268	\N
185	Azreena	Ibrahim	azreenashi@gmail.com	5946bae0968e8836c0cd1ea71c83db81ea6bfc3e2f7e2620a574b5f688768064b5c101f5d63dfa45848a57a31323ac9d108ae20175523e2c712bf029f15060ac.55f6350150d83d7cc8b2f09ffa9bde0b	8783441	Spg. 353, Jln. Bukit Bilid, RPN Bukit Beruang, Tutong.	f	0	1	2025-03-30 10:00:47.526503	\N
186	Bibie	Razali	noorazlinah.razali@live.com	67c0d456eed1f94be38aacd73082bf45c8047fd79b991541e7b53e429e8e27ce39dee194d12fbacbfc5505d5abc8eebe2a9ecd844717d68ffd15dac5356cef92.8fffdf80b01a6e996eec3d1f8844a340	8897127	Pekan Tutong	f	0	1	2025-03-30 10:13:03.582292	\N
187	Afnan	Naqiuddin	oliviet4120@gmail.com	adb12ee127e58bfc79877de6bf697ef6749ed13b55e7744016d58262ce7eb9295d3947f0bd46084808b73e1a1595fcd7b4099f85dcb1a1f95bedf5c05fc5298e.ae0a2b9188a578bc0b98d72e14cc55f8	728 3851	no 13 simpang 97 jalan kecil meragang kh sinaut	f	0	1	2025-03-30 10:42:12.719978	\N
188	Afnan	Naqiuddin	Oliviet4120@gmail.com	5cef291eb3b2dc178061abc6b66cf82a51031a8341ce5cf127eff179848fec98244f49400293b4fbee190882e8b0abdf57eb1673d5c432890ed3e579ba3b3914.50edfa03898b0cc666c6ed06f2bb061e			f	0	1	2025-03-30 10:42:55.602773	\N
190	aqiqah	aminuddin	aqiqah24@icloud.com	12bb8b73d5ad38b7d08539e9515ae8d20f8a43a6825d77b090e3bdd610f8c6570ca5f29b2e991eb26ced59de0eef66d38f862c457611f272e92d98a46254e36a.08fdb4e9f7d05a412be020c227b0ad92	+673 876 2325		f	0	1	2025-03-30 11:54:12.043319	\N
191	Hasif	Bakri	seev.rn@gmail.com	e53ee127cfef9a62595be7ed401ab567d771c78daa628a4a1f55cfb521f7e7079e2b0d6060553293c1feeadc5c3ce5e427bd20195319d7be23d8fff5023b1de8.f43e20dc2bcc06279348530b7eaebcc9	8293351	STKRJ Kg.Mata-Mata Kawasan 1	f	0	1	2025-03-30 12:08:39.959802	\N
192	Syam	Ps	aksyam.2411@hotmail.com	f4b06df31ae30622b2c5979a150f346f3fcbc89131086e1c99cda13f417c5547c90560aba1ac12a55f830707ec4b806813c37a79759eb04cb2014357459bc74d.b79ba60d3a364f1b26e47e25ef9898b3	7148956	no.15, spg.59, jln hj halus, kpg bunut	f	0	1	2025-03-30 12:27:54.656687	\N
193	Hamizan	Hashim	mizancim@gmail.com	a3c5afa02eefdaf20faff7beb33ac05f182c8c2165333860b14d2af9187449db5a81157d575ad17f4f8360f138e30c1f7543b0d9aa414639315f79d4fa87d757.a835b7f3be8fa783e9320a4010cd8962	8888215	Kg Bengkurong	f	0	1	2025-03-30 12:36:53.362799	\N
194	Afifah	Aliuddin	afifahaliuddin18@gmail.com	a5c36dbdce96d556ca8cd539c54911a28550895fce3f4819c9fea65b74368aa7fda1d84675ef4cdb07d5bdb01cf1a2ca9d4ef3079dcc73747305d465ba7234f0.f4b7a862975729263d648e8bf2de90e5	889 5409		f	0	1	2025-03-30 12:45:47.506384	\N
196	Farhan	Ruslan	farhanruslan14@gmail.com	df0573c36363f47bd6f425bd91700240612fdefcb24ebdd652cd5b992487138d2f58e82c269ddf75ca629e3b89588bf2268a62d1f773d65ccfef9d20e86aa8ef.83e105fda2536189cc5bfda8572526ca	7155481	Kg Sg Buloh	f	0	1	2025-03-30 12:57:09.752325	\N
197	Muhammad	Missli	aimnmissli@gmail.com	b68a46e380452d17093cf1571032e01fed80bf228020b51b8ad49a296c0cc17d9dca80959d0cd2c2bccaf85cc5d39eea93017e5c8876753f5ac5d8e1aa895a69.8a10453c31ec912461f5c90216bc0f03	892 9449		f	0	1	2025-03-30 13:17:06.897049	\N
199	Azim	Ramlan	jimmieazim@gmail.com	8912bedbe7b71a8ef3d42af908afae2f611bc53338f23c993af9e3e521c995bd0b906fe18796e654f959d3451f8227d6d40d8454fbbe86c2132400d34f26d98a.e900cc77a20435bddae297b63081878b	8965282	No 64 Spg 119 Jln Wasai Limuru	f	0	1	2025-03-30 13:31:41.008215	\N
200	NUURSAUFI	AR RAMIZAH	mizah.sofri@hotmail.com	a6534f0463cbbc6e74db1572a15ca529856358399b74510771d84b2cdf1a1cbe37ab29c31cf5a4fac61e4810030d4a396c30dcbf8e5d2dec9580e085c8010081.872ed45c316ae729331368a664b39565	+6738622103		f	0	1	2025-03-30 13:35:49.202002	\N
201	Afiq	Iasa	fiq9695@gmail.com	7104a8404537fc41e244ee8bbf4c7eb9d147f2c76ba11486d569c2fcbacc7d6761046ca4b499184c4ad5e3084369405cab913c95eda6bdbbba893d3f54115607.ff217295162ac8a34de84bbe426018f1	8164906	Tutong	f	0	1	2025-03-30 13:36:29.452045	\N
202	Az	Azmn	jeeyazros3@gmail.com	4ccb300960d7284d83b2cdc8b0055cb563231011728aaa5e44f561d126c6c18d999e7f4b072f4f4356ec113a3fe2da8af27a24e148c0d2308b851966c8d022eb.9c416ff0b6f2810fbe6fe6b473c76844	8958662	No 5 spg 33 kg putat	f	0	1	2025-03-30 13:47:22.86623	\N
203	razy	ABDULLAH	RAZYABDULLAH21@GMAIL.COM	b9a8852241d339ece45ba41f7d4965b227ac576c4ac1533a5b41366f19f0ac9a42caef9f1386b8919aa9bd6762ec7b3426ee4bc6ddd620ad59da992813d4f6f3.082e0b98116c372f58d81d899a09c4ff	8644994	no.25,spg 245	f	0	1	2025-03-30 13:48:09.846428	\N
198	Dini	Missli	dini.missli@hotmail.com	251b4255db0741be90376737e52ac7412d22a3f37feeea016f72e4302a90022fe91f2c4278eac37d24e726f36dae4141fc91a267ac8ef57a6f7fdb790e6d1bc5.95d50a7326eaad066bb4049402fb1ea3	6738246478		f	0	1	2025-03-30 13:21:08.165269	2025-05-05 09:32:20.358
195	nurul	-	al_ina@hotmail.com	52386414d1e706956dcd03314b209647251060270342fd13d12993c16fd5ed72f4154c7569c6d10c508ae7ba4933dece7a73f91649f096ec7a0512515173d38f.c7522154e15b6271557ce206d3428aaf	8261611	d	f	0	1	2025-03-30 12:49:51.159916	2026-03-20 13:59:41.015
189	Hafiy	Sufri	hafiy128@gmail.com	bf30bd2654b4570ec88322486ba7f4933addc019682c986129370986498ffa66f222a85645988177a188fc0f085f8004945f3f58cc99ff8cd6230dd8336ca545.77c764363ddce16dc920dff262cde70f	8886022	No 9, spg 124-32, kg salambigar	f	0	1	2025-03-30 11:51:41.465995	2026-03-20 13:26:23.152
204	razy	ABDULLAH	razyabdullah21@gmail.com	298fb2ab1575852fcb578242d40b19a7dc30094238b87cf2abacbc29acea2b76c930967f05de0c3ceb99341c435afda3191b799aceb89fdadf514c8e7600ff5c.b3d171adedbfc22aa8c346fcdf2822a7			f	0	1	2025-03-30 13:48:31.74269	\N
205	Nik	Ahmad	nimatullah.sanuddin@gmail.com	3608b421ea94ff4ae53943e243ede9daab405aef076143f746a2446f74ca55c8eff438f1ce792b69c9513c56445f0822e963a524940d80db0cf82dbe6f2c873c.949d8148bcd83269b787bfefa619de53			f	0	1	2025-03-30 14:08:20.405226	\N
207	Muhammad	Najmi	najmisiddiqi27@gmail.com	2f96f8d5167e8edf234b41945d05f9ca1c5bc3727352091899857183d3df6db08756466f0a8d5b1cf0118e5bad3f9eca92e4e04f78a0b7d90c34fcb564892c65.e6c1fd2acd1e8b8f846db8120759d2a2	8315990	No. 8, Spg. 185 - 82 - 38, Jln. Tungku, Kg. Katok, Mukim Gadong A, BE 2319	f	0	1	2025-03-30 14:26:08.917201	\N
208	Shukri Shariff	Hj Jafri	shukri.jafri@gmail.com	7ad0f9ca18257e21058bc02c71f5230ec9c49ddca27f347c93db17ed2e7238066b8b52d853770dc5291c16fb6c4b62be6b501e49d5687f81562cfbf472f7f029.a737670a0d5a364bb3c53bbd319a4f70	8664227	Unit 21, Emadin Garden, Kg Jerudong	f	0	1	2025-03-30 14:28:22.691471	\N
209	Dai	PHM	daiphm@gmail.com	231a61f8663e14eda660346a3fd1d710a8965f9ba6c768daa3e29145e543a845c3a06b07195b4fd2abdc63253557d057acbd9fa490e90be6d54ff078f5867c68.5017e6f15ce8ebde42bb96bd8664efb4	7205313	No 8 spg 1116 kg kilanas	f	0	1	2025-03-30 14:51:48.027665	\N
210	Wafi	Iskandar	wafi.tajuddin17@gmail.com	5f1c0215cb5ab328ea902fe633b967fdea62a5461ec49d33e4feafdcff0eab514e8b04adcd30f1bbff37248b13e4c453168e611a2f6185b6661984e58bbd65bb.e7c690bb206dfb01598201f21e040b5f	8249228		f	0	1	2025-03-30 15:06:00.649157	\N
211	Fadlin	zulkifli	fadlinmuiz@gmail.com	69f210e296318edccaadd8a4529d68a7303d2b2ce09d0d86480afbf6014f09746d3ef8aaf9cbe0c473518fae3806754b65107a65ca655503e982307b6a213754.bf5a593413def0d977491fb5f5376931	8682444		f	0	1	2025-03-30 16:31:38.1882	\N
212	Hazmi	Zolkipli	mixed_support05@live.com	e98bf7eb6abcc9808fc3fbff3d97c60b2ae7026afaeae096faefe2d53ef411504b99e8ae477390731aa0b1f1e829748d9769c6bd362a5404dd07a2a1ef99c00b.334afd4b50a102a59feb2b3ad90b3669	+673 865 5051	No8 spg 83-8 jln masjid salambigar, kpg perpindahan lambak kanan	f	0	1	2025-03-30 17:04:10.296376	\N
215	noris	Norshahroliswan	noris_itms@yahoo.com	9aa1369b164f569128022263cb899535ca2d65223bcb876f98a915d22a9df3bc73f9778fdbd767ed899ec5f980370304f68c7edce6556841abe35fad66192208.0546b665f0d55dd54bcc0befcb3e7bbb	8796974		f	0	1	2025-03-31 01:16:26.355793	\N
216	Dzulazmi	Iskandar	dzlxisk@hotmail.com	478ea78f180c173a79ff2daa0c838d257f33cc23cec2d1b73aae0dfac5c3b02ac243f81491ef1a2f59f688dca15b332d5770267ae155dcbf7bc6ca6c24e635e6.19dd655fabec70aaaf9efb3cdc67209a	7167358		f	0	1	2025-04-01 03:55:18.412569	\N
217	zuin	Alyan	zhoe.wynz23@gmail.com	f17994fb813b2a8775e3ff28649eddfd26c6dfc636894dcd4d7dc3d148bdbb03b98633d1c89bfa77ff5e9370d279a55fc9d45d06c998a8bdc365f9f33f8fd71b.bbe40bbe84e6b90c70617c116d7db5e2	8781052	Flat Md Gadong	f	0	1	2025-04-01 05:48:04.678067	\N
218	namster		cnlim208@gmail.com	2115a1556e6eadb6ccfe34bb4770f6ef19be071e0e2013a0cb6ff6557fdbae0cfa66ec16aed17e2abaa4d0c296e8d68c431b639511b5b1da5a67fb4dac0a1311.72f58da49d56a9278969b2812135427d	8651668		f	0	1	2025-04-01 10:21:43.369458	\N
219	Kaisan	Lim	kaisan156@gmail.com	b69a4ccf7d4985d7546ea1ab4021abce924131703809b081a661c0c4f8dda087baf10c200983fa781e0e849e29b4e3c36b08e10ecf2b73dde84a7f622c5d58fc.64a5fd9c102db6e379746d69c2fec221	8760187	No.6, Simpang 25, Jalan Rotan Gatah	f	0	1	2025-04-01 11:44:08.031057	\N
220	lif	fah	alifanda09@gmail.com	4030192138e1610935a184828c793da532909a8d60ce1cf80d69eb1782300eee465f34b2de783fe26b96a25b0f35088ef24d90dcf0cb5f2bd39e619f9b925911.612fc2410ba7e8a78a4246086e566f08	7100502	No 18 Spg 122 Kg Kairaong	f	0	1	2025-04-02 01:12:55.017208	\N
222	Safiy	Alikasim	uwais104@gmail.com	13fab36a39f6357ffe146cd68f67b175d8228b9a24929b9349a04fd61c703f2bdcf8e547b6a5b82f27ae395a6eed50a13a4563b906727b82f9cd623ca510460a.289811f3a8ca2661a541b3d7b5ddf691	+6738955109		f	0	1	2025-04-02 05:29:39.578472	\N
224	Danil	Azizi	azixid4@gmail.com	a9e9fe60da5718fb3cb3cd33ece1aba3b9ee21c0b63e6531d9f3e932be643c809329301f56813ac5513bed16ab2367662cd0ee005b58678c0766cecdc9a4b0f4.fd3fbc140f82f55bdf704bb289206c0d	8727903	Tungku	f	0	1	2025-04-02 06:49:24.190955	\N
225	Ism	Jair	hj.ismail@gmail.com	565d6e13dace639a91080f4c67c2ee6a54602e6ab11560007ee47069110a9e20da5ed8b1eb1f3646e688484bb5678eef2d83dd0e5708d6093dacd56fa84ce0ef.9990f1dffee77e6e1dc85066b3f60a53	8711118	No 20 Kg Jerudong	f	0	1	2025-04-02 07:37:40.353132	\N
226	Sophie	Syubrawi	sofye62@gmail.com	a3b6a1646367dd794ae49d4604fee2e870618c1ed06e0e3be4f5c7188939ef9e4cad6ec2a71625428c18576f0df56edf13827792f93ba8ccbeb6dad9c5db6e09.b4da7db4ad5fe821056c7aff8d673e72	8676029		f	0	1	2025-04-02 09:12:52.007078	\N
227	Ria 	Nasir	ria.hjnasir@gmail.com	c59dfad6289f0e511105c8b3e8fd18d700ea78b2ffb193b01b83981760c00a68928b676388c9361bd4df7569c92585f93c46c441b90ad7d5cb1a8016f50d4a37.19e6e2aa67c5201e336b0937ef6cdd22	8957407		f	0	1	2025-04-02 10:04:50.750312	\N
229	Nabilah	Ronj	san_8187@hotmail.com	5fe40a1bdf80fb45b4526859356c4c622575f81bb73fb394bc190f43c56ef713b8d1fc5006c37402378725cfbb53a4c6b275fe30037af641b6600269af6fafaf.14db049e8fb45d1eb4eb05bfc49dec2a	8358187	Mentiri	f	0	1	2025-04-04 06:42:35.452579	\N
231	Qawiy	Asyraf	qawiy.asyraf@gmail.com	8c4b562636e46278e6c821a571cf7c2ddd5b112f2f13629ce4e3971a0c640668abae75247fe9740e35106b1bcda8f4f9f31b4280db0c424a1ebfd5ec6d9bbfcd.76224550ebcf88f5e8bf6372e5107b4d	8722641		f	0	1	2025-04-06 03:38:11.121622	\N
232	Arif	Nuruddin	owyxizme@gmail.com	c12377029309898db37f13e96c149e9dfb83b02d92bfa86ac00bba1c20aabcea1707521754cd8ed5cc323005a8c6ec4d6caec5374b10cd273427ef33b5d97ea1.a7cc7e64be587d3f7ea930013732dbda	+6738876419		f	0	1	2025-04-06 05:31:22.53566	\N
206	Syaimaa 	Fikri	syaimaa172@gmail.com	a1d5bd963916b4c1dc9378122cffe2c93c59d1fe221ca9aec02dd14152f6f0be4a5b136165c83195ec161535ef31288063cf7534348059e907e5da9befbfa715.9814ee2f4ff30e47c4b0aa5c4d8b8906	7332555	No.555 Kg Sg Hanching Jalan Muara 	f	0	1	2025-03-30 14:18:58.881663	2025-04-20 03:15:54.439
228	Yazid	Yusop	yazidyusop@outlook.com	fb1427f576e3f326eb89a4e7650f4535666d299b0e36212c0f4cc80438ff1102a169f0c5c69beaa3e687c608e880c6064e63c9ee2fc9bb13681bd6bbf29177b6.17d7ef8977cc9b7fd83d69e944d31b64	8803502	Simpang 73, No. 17, Kampong Serasa, Jalan Serasa Muara	f	0	1	2025-04-03 06:32:08.23239	2026-03-19 04:30:16.115
221	Madi	Mail	mahadimail261@gmail.com	0265c3db18985893f43aaa2e4df241c1247ac02212f9b513cdbea2e7deaf58d7eabe188240fe4a6d2c010c7351d4969d565887a8ab7c70b6cfaf0a2efe4c08e2.56edbdb0208db28f9f1fdb02e4b8cbf4	8879451 	Rimba	f	0	1	2025-04-02 02:08:35.468338	2026-03-20 11:03:03.27
214	Farisha Yasmin	Yahya	farishayasminn@gmail.com	91935b06c217d8a537e5fc6f088a11c459b24da60f936313b3c96613ef9423c241b6129adeee320312cdf6901413604db0b3d02b474784295cf3431668e27bd7.34c0a3a077d8bd609aaccc015f3b7250	+673 717 3693	Tungku	f	0	1	2025-03-31 00:34:46.300504	2026-03-20 09:32:58.415
223	Saifri	Saini	saifri.saini@gmail.com	8c137fc4a687dedf2d9f2910cfda6e43e0999695a36f7e1ddf7397b68a8fd4ae668659eedee1a8575d30d43723104b9c9679ae88b184c64a4f01a51737caa49e.5bb4e98067496307cce618971640eef7	8950976		f	0	1	2025-04-02 05:40:29.92928	2026-04-17 01:38:01.305
233	Dk	Ummi PJ	umiepjph@gmail.com	7444787d62fbab6808103b108c3295347996b8a29002ab02e0971b2e1fa6bbc2b88f514fea66d69a917e04ef9c6eacaefc9e628d0e5ed83baacf3e7fbece16d0.34f095f734bc36bc3e7b29277df88eda	+673 8895411		f	0	1	2025-04-07 09:27:10.061965	\N
235	Tungku Branch	Cuci Xpress	cucixpress.user.bn+Tungku@gmail.com	8fef4a579f8621274d8cfa6030445db2cfbb342eb5b74e69ebb342fbb427eb7ab2cac7842d504a7994bd657b0089098ac63abdb95841c9548898f2cb308f2a00.e7a5f2f5e0576289570725527f124852	+6738387000		f	0	1	2025-04-13 04:07:49.328928	\N
254	Fahmi	Hafiz	fahmiuyy@gmail.com	72999ddfcf879f46c718076bd56071e5351387dfd897cfab457a462a76699ce538455156b63dc327f01352bec029a57503199594f43d2b69798b2468fd9a6905.3d6f4163361dd4234f809d0afe1d3d50	7245126	Tutong	f	0	1	2025-04-13 10:09:22.908193	\N
248	Abdul	Matten	mattennazirah@gmail.com	c9b5ce156bc69d5751d827c01a4056b9f4ce1e070970f3ee30a31d1271adeab2d0db30b380f00b1ada412c16d69b85e591cf079427a5720842dd166bd8edef06.e0f46b71e20c6d2bd42785fcb01768da	7392021		t	0	1	2025-04-13 06:11:55.410634	2026-02-15 06:14:44.146
255	Waie	Ikhwan	ikhwanwaie@gmail.com	7e1b793694d566e80fc81f6ee280a4fefc56d75f8de3fb7c333fcd77b89a014cb5c509fa9aecf7bcbe30e090cf9e48c58acf85bd5ab17dc4d7a25505527cf41f.b20c90dedcb13e669828f07e2b86c52e	7354724	Tutong	f	0	1	2025-04-13 10:10:51.711699	\N
3	Pengiran Abdul Hakem	Shahbirin	hakemshahbirin@gmail.com	cc33cbd034e7c2007ac1db53a4138dd69accb7a0c1793fa7b75dbbb50b2d45adf3db76d07a0ff9053a6e4d668192f238238add75c99620b17b1dd1a5eb087c47.29afa06a435edbfd58adae3d4b78d282	+6738669378	No. 8, Simpang 105, Jalan 99,	t	0	1	2025-03-17 19:10:02.436344	2026-05-02 02:26:55.367
250	wafi	hakim	wafibrahim1610@gmail.com	8f30fb0448b1b38cfd238809f95f9c29da8da80a2498ca70852fc012d8e08dd5cda99c6f6790e766e5df05d6c4176ae4d2445352eb7188fe9a3e3dac42161cb0.e4923e5a7e918582ed12efc5c07168d8	8651338	jln60 spg 74 no 4 perpindahan kg rimba godong	f	0	1	2025-04-13 09:58:25.776333	\N
252	Soffian	Pian	nikenikejordan2@gmail.com	3bc32a5c5f1f90d1af0e712d0a6a29e8bba4dae12dcaba8ed18c029ed359eee949a5519b2316f51fc5f5b20c68f28bba041c70248950b813b8e5f44c4c3dcc02.a76d6547e7bae186637319ee4561ba3e	8662193	Tutong	f	0	1	2025-04-13 10:07:08.197042	\N
265	SOFFIAN	PIAN	piyanevo3@gmail.com	cb8fc8a4fcefe59b9a4ba8d83241396441f05867cf1f3cde87d8d68b7bb10536e81be4e2800d8762568fae209c19a133d9b67ef2ff15c0399a66514e94cb6e2f.f924176e6add678bb56e4fdbf8842d08	8662193	Tutong	f	0	1	2025-04-13 10:18:44.136237	\N
286	izzat	Pgm	pgizzatpgm@gmail.com	ff2b63635088c251bbd8875f668d64e59d69a3d4f89156c2051a72c7635501a7def130460782a01864d0eed43998107bd3f323c64bb806f2643ea65f73985d02.26dd018457a7dcee3382e7cb56396d4c	+6738807547	Blok 31, Spg 256-23-46, Kg Rimba	f	0	1	2025-04-13 10:58:38.228651	2025-05-05 00:25:00.222
266	Fahmi	Hafiz	yzahyar938@gmail.com	22577a17ecefd419ab7b3762516956b4f1671392bd156c0d19f1239f207e131c03a44ba1c8e41bd2fffbd24235611c0b934acebf0236472c916c8ce2a12fa5a7.cc3c1860d981046c7697c31d4359d24e	7245126	Tutong	f	0	1	2025-04-13 10:25:02.865963	\N
246	Pg Md	Yazid	yzeed.191130@gmail.com	a9bfcdca02958cf3466d7235ebc1c7d3ebb0b7d0d001805a1d8b2b08cdf91f7712ab861146611fa5a928eb50ca07de2d49816d7794b0a9a0a696f6c350d4091b.e81aa2868cfe60262a551e9d49f81d9a	8294489	Jalan99 simpang48 no23 perpindahan kampung rimba	t	0	1	2025-04-13 05:37:35.558998	2025-04-13 10:25:35.899
284	Salar Branch	Admin	cucixpress.user.bn+salar@gmail.com	c16b76f44b10a1aa473503c1bc474e320fbd2b3bbd8986426e2e98b01e1d9588ab4a415ae7258505bf9b1f626320136b0189cf18aaea3a3664baea363131f0ef.d93a70bc5774bf58ce1101943e33aeda	+6738387000	Salar Brunei Darussalam	t	0	1	2025-04-13 10:54:45.554561	2026-05-02 10:54:55.622
251	wafi	hakim	wafibrahim2002@gmail.com	d1cdafbc73bd6776f920cdffe3c9a0b54583c32f109b8a46094f65db8e0fb3c91284dcc25ab0bd2b06694111e6a3c8781bc139729c29d4c55810bdb2d4aaa58d.5f476404ddc1c2246b5124d257450e18	8651338	Jln60 Spg74 No4	f	0	1	2025-04-13 10:04:01.296088	2025-04-14 00:49:57.926
271	Adi	Amirul	Adiamirul002@gmail.com	a752a0049f3b8a131a7a2016f176d330fe36d74df353b538f8bd09078b815f6edab41914e925086627573249f951823efa379ef7d0bc77e51c31ca27db18fa2b.ae7784550ddb179b8e345fdd7c0fee42	7278965	Tutong	f	0	1	2025-04-13 10:32:57.608735	\N
281	Fahmi	Hafiz	fahmihafizz2614@gmail.com	9b42931894b4f244d404824756398c51d2cb865455bc0142a5a5695c52dbe6444a8c3b4f8410ccb02ee1403fd77de28c97158b0ec27dd7bd2d679eacdda7e2bc.ea6b851f6ffe92fc454ae3f6500929df	7245126	Tutong	f	0	1	2025-04-13 10:34:33.32839	\N
253	Khairol	Azim	khairolazim18@gmail.com	ce0feae65bda3aa755c00351c066847b82ffeed6eb4a42d179d53da2077fcba63e5ca6542f67156336396f0c001ec05747062a80c3868b16e344941398db553c.4a0bf73dbedb640a1bbafa6765d91833	8221100	Kg mata-mata Jln lorong beduka satu No 17	f	0	1	2025-04-13 10:07:33.103045	2025-04-13 10:41:56.998
283	Rozimi	Kipli	rozimikipli@gmail.com	d64a2049eb2f89c30fb50a752fd6e2085cd77ca6bd78267bce136d66908c4f6b42dba214efe33557b679cd228dc42b79a5b5c4ff87eeb896c2d8a9e37a1707cb.ab0365631b54adcfe3595b59f3699ede	8659605	No62 spg 41jln kerakas payau kg kupang keriam	f	0	1	2025-04-13 10:52:16.59783	2025-04-13 10:53:37.721
247	Muhd amirul iswandy	Bin Muhd Jailani	iswandyamirul@gmail.com	954465d0bb04af9b9362ff2f5340b695c2113100535b91ac421fc25fdfc7e6c739c72cb5cb85faa1282cc5badb1b614c4c7b3e6cbff9698b6acdfe4252397e06.9e45a55535571d93316d56a63c212022	8932978	tutong	t	0	1	2025-04-13 06:05:20.656009	2025-12-18 11:54:05.667
234	Syahmi	Saturday 	syahmi1412@hotmail.com	231f07cbec715f77e45e0ed9ede135a607d90e65b90e2491be7e0b671faf6100cc7b5dafeb2fa0673f8f26e00abf462c153a7bf9024e724b260dfd4b5e5ec163.4ec68e767776a04fb643e5155a46209b	+6738897503	no.30 spg.11 jalan puragam penaga kuala belait	f	0	1	2025-04-11 01:21:59.419571	2025-04-14 06:20:56.054
249	Haziq	Ziq	haziqziq718@gmail.com	3b6e95d509d87eaeb59230cd70b0a59a2b603fa7b101d01c24c8e77911f1a0624e469b787ccf07cc2ee307b2b7270da986e5f8d543079aeef7b1f8185a2adf82.94be7d91cc00ffe0f102b1df4fb54a72	7354724	Tutong	f	0	1	2025-04-13 09:30:23.076577	2025-04-18 01:51:16.049
282	naming	ming	khairulanizam49@gmail.com	95f3dcb22c9d4659954f8b09eb4d4c7158ec1cee54d1de552f2f72d91cdb3e6687dca29fef5c9acea6a17a4c45cc400b938e6f1e3ecfe2f0fd7808c2c5e3056a.c3045a347f86b7948a705c325477bca9	7167968	kg peramu	f	0	1	2025-04-13 10:41:00.348827	2026-02-10 00:00:57.18
31	Khairul Anwar 	Haji Omar 	khairul.anwar.omar@gmail.com	d54b9cc19e8d9f7b18b3e4f5ee3c5a659ed9b0fb5950224082ed2502a3bd0aa74016c8699c893c431b20a1c2147aeb8f6ce85b740098ab9cbab9e7cdbec9ef26.87e352be2107ff77110cedfeb291344f			f	0	1	2025-03-29 03:39:38.608041	2026-04-24 07:04:54.879
293	Ameer	Uddin	danilduds@gmail.com	60530da652c3e9a8235a3dcfcf430d6c37d09158c23693dd3325f876091172d29fa10de89ff0d6bbc73d03e0cc2020e7ed8bc1477b64bd7280c6bf36aee0fb6e.8f0019174cc74b7e897dae45db9290f0	8306020		f	0	1	2025-04-17 01:05:21.837205	\N
299	Mirza	Muqri	mirzamukk@gmail.com	b066faf8bc1fbe3d52d644265d9fe36545b4a59b963e429f1fda0826c1eef24b95a34218e4ee22c55412fd6e9187c65d6f4d7354d4f8f2fc5864f1c14d405840.e888b8f12081005fd6ab7de475af0ed5	8839413		f	0	1	2025-04-20 07:01:47.08465	\N
300	wajihah	jufri	wafjuf@gmail.com	b6029f8e74aafff24e71f84a0d1750db06dd409ad3b1a019bb7fdd44fea15a294f6b4c2b46e3734a8ac8510c30fef7f617f145d0c1a28196378ac58ffcb99526.c286a9315a52ee34c241781a61148c38	-	-	f	0	1	2025-04-20 07:13:49.626949	\N
301	Dinie	Tazim	dinie@hotmail.com	98b8c61e9dada81ea0f3ce85c95c389785031e3b558a0a4d20023e8da968a9e0ec47fe7785c8654c0ab633036f36f0a4249155c24c7501e797bbdd5261cb463b.f3c90bd563b7a23d80a4255ccb4aa22b	8165336	Rpn Kg Lumut	f	0	1	2025-04-20 08:14:40.350919	\N
291	merr	uddin	mohameeruddin1@gmail.com	1c79918490b1c1f88fb85fcf4c6d4d35b56cb2db728137f2246be0720a8fdb8762d45ba0f00a712012fa7d5408fb8545803a640d0a94126552a7779e1345c7bf.4f5d23bbe87029ab99694dde497f5a02	8306020		f	0	1	2025-04-15 00:13:02.289766	\N
296	Rafiz	Jumaat	rafiz_121@hotmail.com	80f911a84e084f8f4bf2979d470cb7aa9cd97a36507ec211bc3242361cbf74f5a8e4a222afd5df01f36a3bde6f1413114e70e18cacd174f9040cf626d7dfaef5.46df2061fb40876531259efccf07affe	8245431	Kg Batong	f	0	1	2025-04-20 05:13:18.010034	\N
305	Kim		kimbong1105@gmail.com	b89c157fec1b1751da9c58c80a2df3a610479ebe6e6551ca7a037bc21ca2f2646b6e93f182c6a637d8722d522fd896becf3532166de9da9659588e8dba91b796.8d82444dfa2e68cb468c9972e8022a88	+6738827369	Brunei	f	0	1	2025-04-23 12:00:10.198169	\N
165	Azri	Zalain	azri.zalain@gmail.com	0ea2f64ceebfab45ddc0fac1b2d906a654dd501ec1110cf535b8f3cfee7836c688962078c4b572725d1519074b0c10c8a1774bc567b35e20f3473374b283b1dc.575e129ecf192fcb2f0fa12d14330bc9	862 9498		f	0	1	2025-03-30 07:14:05.96087	2025-04-26 08:14:51.104
295	Azmi	Ali	azmi-ali@hotmail.com	a77b49f9c8e1e950c600c3f38e96b05324a79234b94e5105317cf77980e2c4e722f7e63aee976917385295f88ec30717787ddbcaf7503e30de7370ab397b9b71.6b33ea3ae540e2f15c507a3d8957bf8d	8724402	Kg Masin	f	0	1	2025-04-20 03:30:05.020674	2025-04-20 05:18:12.558
213	Hazmi	Zolkipli 	aleesya047@gmail.com	6c4f119096e18fd2f232b9c119123d5f3e1d8eca8510bd33633b00c345da608741f32ff6dea353201396a6ea92aa4cc6e61a7db0665cd2ce3135a1505d57a8e1.66fd2c2e992552bcf44febf6cbf0cbb2	8655051	Lambak kanan	f	0	1	2025-03-30 17:06:42.972446	2025-04-19 02:27:51.795
90	Saiful	Gimbon	polg17@outlook.com	3affc20a52b903b150e2da6d62f9f9b6fa1eb46637c4f439e613f6e5b22868617843bf8f70ac1d4b61666d5b8abb3560dd03d944a6962f24ef6c145350a87fb1.6da0e73a9178f6395e5a45d2d6aaca4f	8922289	No 114 kg Pengkalan Tangsi Layong Lamunin Tutong	f	0	1	2025-03-29 14:34:26.745182	2025-04-25 23:37:35.364
297	zey	ana	suziana.bru@gmail.com	227248b8e7f821d02794efa9f50ca5a9c9337a14145c9bc05ba7c0bbf6305a6e2d4b7b3dbb8320720f41b6fd99d2bec02eca70c67b65d1cf36a384e1dad11d1f.b9dcf0ada9c64523a64c68af34751038	8797638	Tutong kem	f	0	1	2025-04-20 05:53:43.05934	\N
292	Zuhairah	Ahmad	pdenied@gmail.com	d0a3ca0ac5dd9e79b7dbc1c461e13130e0cb01fdddc21d445a4827ea1644e8ddc7e32896c450367804fb9b5c2f79f00e5be437a2417f87263b8c16516f0ba57e.7cba7304c2be1e1cc92772ff34b6da2c	7119211	Sg Akar	f	0	1	2025-04-16 10:44:48.977157	2026-04-29 09:14:07.465
290	Serihardie	Hafizzan	hafizzan2004@gmail.com	8fd83fc06c2fc3e8490e4ad0e1f170f811a43427b6bcc85472fba797b6ba76d2e6cc073e89b48465434873a7f702e4ca9e97e7637749e36fff9e328cdf6aabd3.549694fd4319c2bbab25ab42ad702a38	7234355		f	0	1	2025-04-14 02:43:56.619951	2025-04-14 03:03:45.488
294	Fandi	Ahmad	fndiamd@gmail.com	84b6552f9d9f5d627753ffb8fd2802a5953b3994879741ffcbd1832f6d1e329c6cbabc0f9028b9e22aef19a42b45518bddbde90ffa2a8c6293c3b270ae2ce24e.f76277006112eb97d56bf8dce76c9527	asdasdasdasd	Jl. Anusanata Gg. Mawar RT 07 RW 11	f	0	1	2025-04-17 13:48:19.892174	2025-04-17 14:13:59.221
303	Izyan	Mohammad	izzyhana152@gmail.con	57fbcc3bad945cf281e1c98995127c1f117f10a03761cce6fdacd6c450b075069d808c50fcc3d645bdc8b0ed4bbbcb6c0211fac81bbd40454a04c5f9ffb93a79.ebf8dbcef9c744504f39b1242e9368ac			f	0	1	2025-04-20 10:15:01.159042	\N
140	Fuad	Aiman	fuaadaimaan@gmail.com	9015a6dec81ad1dd96755d9f34ca561623c676087f5ac5f0c14999614462f8544cc9578fab97a546bc42cbc504701a6c63031774217675dd0d189751300f060e.e6963cd455af9dba91498e02d2db6840	8767670		f	0	1	2025-03-30 04:16:27.573738	2025-06-13 10:14:23.471
298	Azamie	Hassanal	mrgrey2525@gmail.com	40954320fc30f5fb5ae48fc0ea5f5d354c340028d014b468342706f8c86f4f8bed658b4c38b4ffc8a1551eb89c96b5e4703db2ec083242c7722bffe6e88d70de.c020752469843e4d34f31bc878ac5355	740 2705	No. 237 Kampung Serasa, Muara	f	0	1	2025-04-20 06:54:56.110516	2026-04-02 01:01:19.61
287	Tutong Branch	Admin	cucixpress.user.bn+tutong@gmail.com	ab2bc92d51b44540ccbf6a487bf037474caa407bb8e3de5d791c97fce25e900922f5885e1b495c44a9fd47ff590f6a104a0f99ea85746f6d61d5153608e39fa7.10e76cdc81af0343fe60b1d63aa22119	+6738387000	Tutong Brunei Darussalam	t	0	1	2025-04-13 10:59:57.220541	2026-05-02 10:44:53.816
289	Rusydi	Murni	rusydi.murni@hotmail.com	f1dd9bbaf6a190f3a635d87b9e7509553ef2c70cd5c0f23e859896c1bc5ada0a3de3946c7790deac3e202112ad389aa64a3968e2e8671e0788577354ce1ea41d.380455d439a8b51d2baa0e780125c5fb	+6738920109		f	0	1	2025-04-13 15:50:18.385952	2025-04-26 22:48:58.217
43	Mubin 	Yusof	mubinyusof@gmail.com	a780747c729deb0307827ef2bcc0bf81174c274ef0cdfa0b3d421e777cc0bcb3a38c5ce1c8343c4abdd3e4683aa4d6ffaca987b2552314c6f83d098a8db53831.91fcb7e3d44474ecd0d4c7ad34f1dab2	888 7574	No 15 Spg 466 Kg Beribi Jalan Gadong	f	0	1	2025-03-29 05:31:42.880699	2026-03-11 08:01:43.189
306	Waqi	Jafry	waqijafry1@gmail.com	da9f2d9d70405f16e0e4bc659a3f87acb079540b39742c7ae3e63df3e177de85cb4a3c27a539e1e88ec6842db4ba8acdf53b1e935276bc7062a107f215c7ebac.1ceff2b3bb41cf16542e449bc5276ae9	+6738658308		f	0	1	2025-05-01 10:43:22.577641	\N
304	Saiful	Ramlee	m.ramlee@hotmail.com	710a13ed11891c3da678f5a585e9d5d1cf489b9e0fa7600af4469ad2dd2637576effbf34bfda4cb3cee117ac3811ffb8d3a2ca50d48c21bf17576c78e2f633dc.2b8bad387d8041c8829e8e2dfcd68d7c	7190237	Kilanas	f	0	1	2025-04-21 02:41:49.049715	2025-05-08 08:06:57.065
288	Zulkhair	Hasenudin	zulkhair.210@gmail.com	f8b473a4c6a690f596375752818736b0e2640df58375abdf0a7d6fcf74b1c4b510257df4ec78d9add680ae30b653c9cfc97ea59cf4008d5559f58fbe22126048.317e38a7ebdefabc2b807986db0aa9d0	6738270210		f	0	1	2025-04-13 12:19:52.59328	2025-06-02 06:20:01.158
302	Irma	Haji	irma.amira17@gmail.com	d2583f0262b2273ebff9cda7990f28b00f6a4aa4f2461724edd226d73b8d089cbf84d3cf01b194be6682e3addaf0a07084ab36e5b6dbcbe2257b866b76fbef1a.ad313e4e4290bbeae281f1842a2dda1e	8646437		f	0	1	2025-04-20 08:58:22.90876	2026-03-20 11:30:16.899
270	Tungku Branch	Admin	cucixpress.user.bn+tungku@gmail.com	8e08fe2633b394589ffae91eb2ab9fed583355ca4639ecfd7d0a0e42c6d455098e207cece2fe2237765fcee5635171f56b49d8729fd33ea0b0ce60da6823c571.c03d32a3b4e493ba85c3bb60f0edd65f			t	0	1	2025-04-13 10:25:36.722072	2026-05-02 00:10:17.72
307	Howie	Lim	howie_lim@outlook.com	ad6b9676753d67724a736ee64b5ac72ede1560de7117526f2e3f13b4109ea86ae6c587bac5edadad3fbff766ec11b10de5332fe875be122134e7afbfef452114.b92ec01b11d1c4fbc53d607af1979e71	8609307	Tutogn	f	0	1	2025-05-01 19:45:07.513716	\N
312	Crystal	Hu	crystalhu17@gmail.com	6cf69122bfad8d840646d377e2bd99291e803a86569c88d5ec7ec4d4d69969dca5bedc9f7be34380a8dc086d5fc9791dce8fe0708ffd9c267e4d2af2cb280560.cb2cc2eda4f3e841a3c5ff0974acf49a	8832378	Spg 884-25, kampung jangsak	f	0	1	2025-05-06 07:18:37.045057	2025-05-06 07:20:26.023
308	Adibah	Hamdani	nurulhamdani@gmail.com	045298ae5ac1bbf165025a3596ad1432a77b1c9833a89813caa7f327c6fca8c2238db0a98962bd6f14e1e9f474d1511503930df8c14c860fdad10f3280bdb8ad.c8fa54169597e002f6441aeba0cc8307	865 1086		f	0	1	2025-05-02 09:09:59.610983	\N
318	Nor Aqilah	Haji Abu Bakar	qilah234@gmail.com	8962e1192e98ff12fdfe0bab3c302df9b4037e13fd82b3797fd9b89aeec45c76c1b311cdcf2de32500cd0ce12fca691e54688d8e18d7a57d661b9013b2824ae7.e3c5724ab97b603625ebd64ac3958614	+6738951282		f	0	1	2025-05-14 01:20:42.423741	\N
319	Fakhri	Jaladi	fakhri.jaladi@hotmail.com	81146e42e2524a96e7fb64c78870e814be7eb4d3dd0c75dfd9f59a6e4694e2d95ad8270fb3f18fec5d7c57fb8f28bf0b9baa73729a0012b2c632f0b2719b45d5.17f5a41cb49a360b18254740ca2d2dd2	7315455	No.8 Spg 363-73-13-3 KPG pandan 7	f	0	1	2025-05-23 07:41:41.634165	\N
182	D	J	syahdinajaffri@gmail.com	726246056db629f8842acd0a331f3efbeb386a5cca4fdf70070e0f6395720d49dc7a3e7a9a7b7b3c176aae2f03fbf5e36b9e25db2164891673ee2fb7be89eaef.fb82a868c6b1c8b9c80109fc2e54d312	8168371		f	0	1	2025-03-30 09:20:12.183923	2025-05-03 10:17:09.81
316	Shaheeda	Affendy	shaheeda.a610@gmail.com	d458420eeb4ee8130275099b744cbec5917fbf0de1e0615628e6a4d17c917594401cb5ceffb9406ad261dd34825d9cbf03ab7c57ae89c64e1fc55644ad5c557d.0e59dd82faddd03e4ec4a9bad64c9c8a	8379999	Rimba	f	0	1	2025-05-12 02:51:28.056681	\N
63	Afiqah	Shahbirin	afiqahshahbirin@gmail.com	021eb212062511786a6b71e61140cbf61517550f3abedb90f00365f99f764c7423b78124c13b53ca9a9e56147d546a36ef25169cdb2fa13d3de47bcb78a57d55.5630015d8da960aca6b9f0c2d7a38c58	8650873		f	0	1	2025-03-29 07:30:10.11988	2025-05-04 06:40:07.484
310	Asy	Hms	asyhms11@gmail.com	83b2cb19cec69f2ca3e6b8429ef940bb1858f25cfa1025cd443d8a2331182b5eabb5f2fdf924e45635fd71ade4e74490e55bdb160877081767e285e2f5974c43.dd9080b96c9e912ec31444f002c1629a	7175469	Manggis Satu	f	0	1	2025-05-04 07:28:30.820479	\N
311	Syamim	Daud	syamim86daud@gmail.com	e76f0d0c67c4b8acf6db3d1ce44052827470548aa935333811d870a77cfc25137967c8bae8f88d4d397d1a50b2270b761c75a723998fc18a8e6b775f26494f2d.210d5734a7e3a74b1e465d20e6d45656	8932055	Jerudong	f	0	1	2025-05-04 07:47:30.621718	\N
309	Hanis	Kamarul	hanis.socialmedia@gmail.com	3fd55055b7e1e559f4c94f080253d62382751a6c9aa98773322f76ff71062b79aadc0534dcd504e546a6cc5a3484947f1ab241214bf175ee5ea469a88d9dfc9e.505940a295088e09ea049a30849db0d0	8277500	No. 26, Spg. 55, Kg. Sinarubai, Jln. Sinarubai, Brunei Darussalam, BF2120	f	0	1	2025-05-03 10:26:23.072573	2025-05-04 09:02:25.612
314	Nadia	hms	nadianahms153@gmail.com	d5c6f07ddda3e37f578ebd2ff5af5fb1c03307cad46e57a53446ee622e6b4655f0fc5ec0e6ac00fdc670a0929494405e47ac5ed5080b87bc05ec239b0b36fa62.36cb75cb51ad7382f3ae8014359d4083	8154550	nadianahms153@gmail.com	f	0	1	2025-05-07 12:16:14.801899	\N
317	Hasan	Zikara	hasanzikara99@gmail.com	ddb0b3a4535a61694fe433da9c108c6ce2a2624bb3cd11cdffcb39b4b902904cb440caf142e77c310ee48d560d4426bd3330362a06f3c0f7aab66aadfd2509b6.30ef24b8226b669b8213f0a1f0510917	8286062	No 113 SPG 111 KG Lugu	f	0	1	2025-05-13 01:32:51.817485	2025-05-14 07:04:28.297
325	Supreme	HR	supremehady@gmail.com	23a9364995fb5f1016e00ecb1e0c4b20f1e765e27e33c15a2e5a8b2cc25113635bd0b2668a77f3425328644fb8f1c5a8389677d0742120b78eb4a8e0fd9924b3.ca3886b42c5d4778b478f34ad2e19811	7151413	No. 8, Spg. 665, Kg. Pengkalan Mau Tutong	f	0	1	2025-06-22 06:25:11.410587	2025-06-22 06:28:13.496
315	Nazzmi	Gudi	nazzmi.gudi@gmail.com	d4a2f158282a0180f8a322d90ac5d75c2f567ff4da2dc6c80c27dee98041fef739b4c46623a469f0698eecfab4b52897423f2c789e0c1c8ab4abf4ad09da828f.895e5981ab1e3f73a4f87cdbdf5b7610	8660106	Kampung Kebia, Tutong	f	0	1	2025-05-10 12:55:45.700148	2025-05-10 23:10:08.299
323	bb	talib	hondahyundai6923@gmail.com	4e7a347271c04253f1032e9c31a410e0f6ef3e5633b4389f27e95b849218fbeaaa5cff7da55cbb37b20e91fb6fdd2e13c1c86dce726f96570d81a6c81c2aa99a.c5706923bfb08f91e627b05a0faaad52	+6737132032	kg bengkurong	f	0	1	2025-06-03 07:02:25.672565	\N
230	Ummi	Najibah	najibahasyiqin@gmail.com	bc2da68306d2fd09c0c7eb24dee67e29dee00ef00e1275cb6783d52854ff8502cae053b989462e5626e65aeb0c677093f09b6aa59796e9896dbf3c2efb3e8a96.ed36443a9c0e999f11815d2abb7ede73	7166886	No. 67, Spg 342, Kg. Tungku, Gadong, Bandar Seri Begawan	f	0	1	2025-04-05 08:50:06.721429	2025-05-09 08:42:25.913
320	Sheikh	Mahmud	masakie3324@gmail.com	907272a178975d144d3355dd0fb1d2cbc9352e9eebc8c8c1cc5444e7fe886c46a2479735b8f36b094aaa0bc50166d12f5d34bb2ef4413cb576ed04d900493d04.e25fb995bd978d925328469039554de8	8818017	No 767 Spg 767 Kg Tasek Meradun	f	0	1	2025-05-24 00:11:29.850201	\N
322	Hafiiz	Hamid	hafiizhamid@gmail.com	68b7b9a260fac4f39b58f6327b17b41603ba5546204643cc2923d51b624e20d1c5760ed0bc7eea96a306a04a334b0ed134d1d942dd88bbe6d2254a5ebddde895.0e6080e80479ae855a83940f65a2ef23	6738650115		f	0	1	2025-06-01 06:38:54.59066	\N
321	Shin	Jong	shin.jng@gmail.com	87556854caf15c401e48c633b5d6f9192ec79af740637084a7d965af4a8f3dc51b70d91d3ac7a6910882086c7d7d9f6be00404c5efb83181203cdf299a0d6aba.b57b649b53597fca1f5faecf8b640749	7186759	Spg 507 Jalan Batong	f	0	1	2025-05-27 09:58:33.528092	\N
324	Izzuddin	Hasim	m.izzuddinhasim@gmail.com	71c7ed3d5a287ff4a3e8b53eae948ceda753a4a754bdb213e3d273cae59b4541e4521f13e7692d259eb8c07fc30fdf9d02b4e17cb5ed0c1ffd8cf50a664588f1.f528f42484dfb2dcf51370e63efb7332	7140373		f	0	1	2025-06-13 01:48:34.049182	\N
327	Sahrul	Nizam	sahrulnizam509@gmail.com	714146d629349a3b1c025e2f68c6e49062482cdd086601e58acc8fc9980cc29d65da01f12253bda0a836dd12d8267df256e48e00f92cd10e38dded2046d6225a.9ef3d32efbac51a2d98957782b18a3b2			f	0	1	2025-06-27 23:44:30.926566	2025-06-27 23:44:30.954
326	Nisa	Aziz	ichaapgaa@gmail.com	622450e4195b976befbeaaf7ffad5cbabd1f22c105d3db7de545be863d5511fb83f4e09d1b5167e0b33b20bcc37f3c9877137d1886881d4f0270f201e22ee7fe.f3b3709c4171ace202d851bb3470fc28	+673 865 3131	Meragang	f	0	1	2025-06-24 08:25:37.109031	2026-03-20 14:29:13.631
313	Sahlan	Sahlan	nineeightfour.sr@gmail.com	91565cbc5fd6e37f43f316acac0678e55872f856bcae0a9fc911c5877292505597ba042d5ff0ff04b3d4b588f937d91b89130532543a5a640669d3ccd79c708d.5bb2739c5de85eaa5c4bfa0f43734e15	8260984	No. 35 761-3 Jangsak	f	0	1	2025-05-07 03:52:52.662608	2026-03-19 04:06:22.216
329	Aiman	Arifin	hfznzms@gmail.com	d7372ca60d624b6d0b5168972495835637afe5ee81400ac904284a94ae9cedf00d55209f8fa60a132987b624d816db4844d644926bd510df802c7429eb046672.efb71c2fa14428d51961881519c4d682	+6738929304		f	0	1	2025-06-29 09:21:01.329751	\N
328	Fadli	Zaini	fadlim.zaini@gmail.com	c543833e2f3b1312826400bee58c37abd7cabf8a01e30e0d5d5ba6dd2a1ce7b3633d10782f96789de9be71feb5b643482e5172cae1fe63be667771e0ecd7d483.a1621335b5a5d804e9c0117c4e2b26ae	8868212	Kg Sg Besar, Jln Kota Batu	f	0	1	2025-06-28 03:08:54.184404	2026-01-19 10:14:10.615
347	Mo Hazuan	Mo Ridzuan	ruffyridz@gmail.com	634c3652b41d7c5bf7ff1e438cf80fe170de52bdb6a5a223e5ab1c7019333eec7212241cbc58ae1ae3278307eb856ab935d157cae1e822c21a236d5285789156.14a5dacc091839b9e2f56521ad6ddbed	7440910	Lumut	f	0	1	2025-08-31 02:45:13.377412	\N
343	Azeerah	Jailani	azeerah11099@gmail.com	1cd7c6288cdacc87cde9dc469801d42feae45ae61f580ea6e491e13a9224cb208c906c2cdc3436298c4194ebe089715be40276809ebf5b06a3861fb2ae410948.c31d6dfcb4380df1c9b4747857a3ffd3	8840377	No 25,spg 73,jln 60 perumahan kpg rimba gadong	f	0	1	2025-07-27 06:15:58.79555	\N
330	Azhar	Hz	azharuddin290998@gmail.com	1f76d704b50319f296e612d90bb7fdb5be1940f7739728dac70b50afedaacdccf1fbe86e1a70e7b0b77bb46a49277e29a823a5e63fe77850f923119808e6c80a.41dcfc6289b7cb41e529689a288b1811	8326900	No 2319 kg junjungan 	f	0	1	2025-07-01 04:57:42.57117	\N
349	Nab	Jublee	nabilahjublee@gmail.com	9c69d63ea79cff50a59608639e78ca12fb9917bef299a308d2081d405e193c30f7509cfafdf956f630bf63ac1924c4a85635742ca2a54e55bbeb6b47c4e349a6.fb3f4fa39b2965656478d2fb248ba6b2	7453399		f	0	1	2025-09-21 04:44:23.908929	\N
338	Yie Wei	Kong	kyw45love@gmail.com	3303b00c50c7e47f64b38102f03b90f6c18db64648262ae70d1289f852b62507db34490b54e42c1372e47c7025b1ffbe8fcbfc584d02b7bde63a82061b364adc.b61014eba870807b33c940d6d6b69f7c	+673 889 5006	jln 3, spg 34, no.7, perumahan kpg rimba	f	0	1	2025-07-27 00:46:36.157793	\N
332	Azim 	Zulkifli 	azim.zulkifli.97@gmail.com	5b02c845655460edf1654fbf55e649d53e049a29044345a38535970a456404c944ee20c052aa96bcbb443b2783810f63c4c7b9d49b6166c06279c45b6b528e87.5a37dfff31250775bed922539071dbea	8796438	No 14, Simpang 130, Jalan Binglu Selatan, RPN Tanah Jambu, BU1129	f	0	1	2025-07-12 04:24:08.021345	\N
346	Qawi	Roslan	qawiroslan11@gmail.com	742683d5264f3e960151d73c7eeb9114443955a63a55db2e95e8481bd6e2c8106f20cbbb9738bcff1a423da8ff959442ffbde9af33253e2f050800a37047f5f9.0db590d3f9dbb937b4c6f05a2e6b75b3	8976814	no 2, spg 78, meragang	f	0	1	2025-08-17 03:36:44.754576	\N
331	Afiqah Zainal	Abidin	fiqahzay@gmail.com	7f1e910f253662165cc8087f535f75166ab69ba9d0e78b0612a0c683bc0126c1ab603e3227f0bb53df5366bbe0870ea6d2d304a999bc917c097f1212d9a01dbd.4d4f2636fe8c709c81d3fe2f6a34ee84	722 7280	No.27, Spg.58, Jln. 77, RPN Lambak Kanan 	f	0	1	2025-07-07 04:07:08.861158	2025-07-07 04:07:56.113
334	Nurul	Munirah	blackjackmcpd@gmail.com	72fe886c04e5626e22eaea66c537a83092014354d24b2e1b06f144260937ee76defe6c96a9be4fc38c37b28224663a344b14d9356d105a649ef2f9125a7bbc55.1e4e834e9ba68b270232ab70948c7ffb	+6738364111		f	0	1	2025-07-21 06:11:19.900578	2025-07-21 06:22:33.988
340	Masayuni	Abd Rahman	ayuni_305@yahoo.com	4d8e345375590f1cb1f49e9fec1dbc879b825b1d3d3cdf81bdcaef0bf9aa34536896712d9031e1032207521e682a2c25e7ac5cb8c656123a774dcfc14343d8fe.2111e2aeb82245c569363142d5086d66	8930589	No 20, Spg 187, Jln 77, RPN Lambak Kanan	f	0	1	2025-07-27 02:55:06.859323	\N
341	Jacky		cruglow@gmail.con	f0719a3c88fea0e4b8168c26c28a31ff7e3fe2dc3d9b8387ef57193a007930106ff46761ea8295b23eb905bb11198ccafcaeea11c07e585ed267ffc6eff38971.96ef5ce3e1299af0319de033a59fe39b	8681311	Lambak kanan	f	0	1	2025-07-27 03:29:57.39169	\N
336	Dk	Fazera	zerairshad.4@gmail.com	cdafdd47dff893d3e644714f66565eeb65c0c0b1beb8a0e65ebde2908a1100203fb9fd2ce87950552acdd1b5a6fc8f86a3064542ebe8aed5ad0861436977f8a4.d1ce2111ce39f019d44b90feb6d8caa0	+6737280564	Kg Junjongan	f	0	1	2025-07-26 06:44:07.330092	\N
351	Sofiah	Sulong	yukiyama1911@gmail.com	c1d912540c643eeb2300234dad6e4c62e8a3b8515de0422f3619bfb162557f28361770eef1b07845d15ecce5e0652ce9f8e155131c3dd64b059d68ec73bb81fc.4c6b8c207fa3f0b843cc8170ca8c70b2	6738967968		f	0	1	2025-10-19 09:15:46.284542	\N
342	syazwani	sha'ari	syazwani.najibah@gmail.com	18a9214394f1c64aa70bb9fa0c428ea0b23438012cfc9197bb0c325968c8d7d978c274721e427b47d323d279614dcdecc1a1abfc403db657ec644b3b2c3b7fb8.b032c7f42b4868fcbac3fb55b9a6d6d3	8194618		f	0	1	2025-07-27 04:34:23.61617	2025-07-27 04:40:03.304
339	Azian	Abu Bakar	aazian.ab@gmail.com	610ce7faca549a4252ee045a17cbcdc167a3d98dcb3d551ea79afd7c36daea302c779a5cd57859525c8d69c8466bbd3ec5c9a28eeee2b6ef88ef4921c3d653e5.cfd4ad7e174b9621c15dde117bd99de1	8111438	No 3 Spg 68-20-4 Kg Madang Jln Madang	f	0	1	2025-07-27 02:31:33.275095	2025-07-27 08:49:29.316
344	Aziq	Rahman	rexyl13@live.com	72875206f25d58cedfd34a678c15a9cafb9a6179b27bb84549bc6770b48a14f4030475338b32b1d59565e70b12fa2bad11f03ed10cbb34a97e436153abd05889.725c255a6a1953daa2e5c869011d64f5	+6737256292		f	0	1	2025-07-31 07:28:35.450452	2025-07-31 07:30:32.181
348	Waie	Rosman	waie.r@yahoo.com	a02f9eb28318cdd9301a875011a7490bf3b9d0ad1922695a14132a18dfad443b073488360502e8c64d4dec369ac3cd2e20410303e3350003b091f16db1ed840f.d275f6a5cbd14086e9c10b332caf51f2	7445522	No 33, Spg 92, Jln Hj Halus, Kg Bunut, BF1320	f	0	1	2025-08-31 07:07:12.37151	\N
333	Jane	Hong	hongmeejien@yahoo.com	32a4e483d816534a7d8fc66faeff0b8f87199fd17cb01a410b1ac352b418051b668065499178493ae1bf9e1ef2ad09f0ae09cd04cd273ebfef7b6cced8a8176c.d96c1e75f4c006bcbd8b279a07f81e42	+6738958959	Kuala Belait 	f	0	1	2025-07-18 02:05:05.933055	2025-08-28 06:54:40.768
335	Angie	Tan	cheeann.t@gmail.com	97c7318bc1ebefb492d6afbf5aac57b74596f450a1f788cd7f15d44bf4c1e6e0a3856665068e07a54842ca5b32b247090ba2a900100894c88c28f278bf1ad5a2.63cbc1b1c02e083a5d94440b51c9c694	8794783	Jalan Subok, Bandar Seri Begawan	f	0	1	2025-07-26 00:24:29.562562	2025-08-30 02:20:24.871
285	Bengkurong Branch	Admin	cucixpress.user.bn+bengkurong@gmail.com	9e6f8385210ba47984e6e18d9e8d6c8690ac74cc951f42efbcb7b8b9a4277217e9c5d111e76f0b1593058afd50e5ce4d9c55df7c3d5ae86c9e25281d8bc90b2d.fd47f763f3037b92d44bbbbec30228ce	+6738387000	Bengkurong Brunei Darussalam	t	0	1	2025-04-13 10:57:12.92103	2026-05-02 00:01:58.847
350	Md	Zayn	ajib6602@gmail.com	5d070662c2a32303b41fe475b0681fa6a9c90665f45cc14b91e19cd7e5603c932dff0a328151e0a218ad2fb868b759415ac772e510a53b9b39c9121d44b1832c.c8860a1a7dcd42874247e45356a70598	+6737446622	No 469 kpg bokok temburong	f	0	1	2025-10-15 00:05:33.01865	2025-10-15 02:49:35.176
352	Md	Daniel	danielfab22@gmail.com	9f3398f969bf31f8b60a68bc0d0202c08838649848743a4bb7c4cd0f57393d7a281fbc74507e40bb95b691ab4c4406ce44d6c3024361d8ffc6284233264438d0.1a029a59e436c045cc040b260101798c	8855164	Perumahan bukit beruang	f	0	1	2025-10-27 07:37:20.24746	\N
353	ZZ	Arman	zzaaah13@gmail.com	2d74b0760f89937dfb8a3f7b01d54cc0b057e1c45e48580fffcbb15801f3759ec6223cfaa609f3458156ce89e6c4ffb92a46cc215d996ebc077f539df8fbeb23.46bbf0ea24b91df6183ebef792466f92	7161892	Tutong	f	0	1	2025-10-29 08:19:18.014738	2025-10-29 09:25:28.662
354	Hana	Y	nurhana.yossli@gmail.con	cb3138f4ac3a6bd82c7aafdff612c69cc81da23075a5af6a787705f5c6a0dc8abdb541443069e52c8047f58ce5f429b34749fad5b0527f9a4625eacaa1eda07d.b9dee6a0145be9f9cace4a59561d11ef	8827221	Rimba Jln 99	f	0	1	2025-11-04 04:57:06.31117	\N
337	Jai	Rahman	jai.rahman.512@gmail.com	854c97509d2862af354e52f88d6217db8df35ddac5609e3f1f0d867be025761ccc623bcaf57d54e120198a5e4408fd08bd4c92d5007de8953cc6fed795e46b3b.601183ec7635e000789febe1e675fb88	7372273	No.26,Spg 326-61,RPN Perpindahan Serasa,BT1728	f	0	1	2025-07-26 08:32:10.591707	2026-03-19 00:15:47.606
345	Haziq 	Kamal	akhaziqkml@gmail.com	bfc82f8bfdb78422d5697878e50074cea1904a05d3424d333865a42a7c7df65aa0b74e29996c0e38ccadbce30de9072277d6547720fa22c9ff0585db62758468.03e096f8e29b4932257e0bebd3b818cf	8250311	No 36 simpang 64-54 jalan binglu barat, rpn kg tanah jambu	f	0	1	2025-08-10 08:09:53.081181	2025-11-30 09:26:58.2
355	Hj Kamarul Ridzuan	Hj Ismail	kamarulridzuan17@gmail.com	bc8689cf7f4f4a53888b6ee97268db674437aa30537737efb1fb68c854acb7ad252e71348d3c755aa1f1281358e4691f5648f29170d637fed691dd31c6821b69.fc44e06f4b4d926fe9acb5a279770e7f	8217105	No.15, Spg 240-63, Kg Kapok	f	0	1	2025-11-06 01:39:14.285117	\N
356	Nabilah	A	suhairah.awang@gmail.com	ba7621b330f361d373fcb5763762498831548ffe19bf533770eae22e08e01248bbfd926ae4105bc02128c10fd6c1a7501eec152e5ddbca505779d85c9a19d395.3b3043c7ec0f78543ce7ae82872588ed	8138869	No.7, Spg 503, Kg Jerudong	f	0	1	2025-11-10 03:57:45.927185	\N
371	Gus		pharaoh.cinch-2v@icloud.com	075eab5043e38943e1c432502094c317a022a0ca6acf5a4b58abe026eaaa700cb604b8efe3c34638be43f3fab542311eba54048a2cda0a95a9edb2d408c8bc2f.d18683b90ab10415c298c1eccf566d6d	8815259	Brunei	f	0	1	2026-01-10 02:22:06.713098	2026-03-30 10:09:56.18
358	Iskandar	Zahari	hanafiff8@gmail.com	814552fdbd7d999375004414ca41ffb09e798ca46a0e337ee4ddd69962144d8affe330ce97f4d6505883d55d3912f03eb19784f22275005f09466c5c5450bb20.3269b7d0542cf7ae22a1332c5d1a2d1f	8939160	No 1 jln 82 spg 76 kg rimba gadong	f	0	1	2025-11-16 08:11:04.284036	\N
359	Amirul	Akmal	supermario11361@gmail.com	beaad94b2fb8a33762b6f6a1469340d447c9a9012a54ab83a7d61a99f10a7df93420b40620af4aa884f3cb76cf42fa5cfa3135ae1fbb0e0466f7243a97e6bdaa.f4c9f6b61c997ba93324b1ad6b4191d7	+6738277282		f	0	1	2025-11-22 17:21:05.452068	\N
360	Nadyra	Sahrizan	syazwanisahrizan@gmail.com	7a58998ab527e830dc58e8c6309b78d523d5601524e6afba609cc1580b4ab44ed04ba27563494d5cf10662f1ee0a5251d2233f7676ad61f874343482936fa8a8.33d4b59bb6775da5294a3d8d5d14d612	@Sn231200		f	0	1	2025-11-28 10:27:16.614674	\N
361	Keita	Nakamura	boomeiboo@gmail.com	030347c0354e0e29aba32abe68a061f111a7cd388d0cf0fd0961cd72e3b4eb1281e7c64ed0327b3d1d04b12b7dacd21c7c2973f5e12d7b734e539907edc3d037.73a43d41d36229ec977795b120cdba3f	01111323880	Atwater	f	0	1	2025-11-28 12:15:05.433108	2025-11-28 12:16:01.354
362	Syafi’e	Mirhan	syafiehabib_542@outlook.com	1430ea4fde28750e2913bfaa6c4a1607d7222d69d4e26430428b0de0e6eefa754c6bd3de99ead59833c03aa9cb9c7d5d79b46beaa83b8c17de12a1b78a5e6531.5c466d6b1da15c5fef8387afd509a994	8690582	Jangsak, Brunei Darussalam	f	0	1	2025-11-30 10:28:40.931581	\N
363	Rin	Mardini	itismemarriedt0@gmail.com	aef0e20c4f860a69cb35aba98ab3ef032fca6adb9bdd63774dd5a3f595bfce87513f1469e2ad5a34a2af382655cc280b7e85ab05e45a8c2c35aa84c1a176ca04.cc3c5fe73ff6b068dc1ee8695b8e82a1	7374553	No 101 Jln 99 RPN Rimba 	f	0	1	2025-12-04 02:29:30.515261	2025-12-04 02:30:24.561
364	Hilmi	Ismail	zulhilmi281@gmail.com	459e1da82607cae14cf24965e0629f24151e6fbbf9e1b255b181676edbecf65ae5200f5c2ac498d70c6f786e6d56587d3faf1354ba488c2a515f13996eb1f16d.de6e173ec4e3e75ec307c6b89984857b	7168833	No.4, Spg 65-22, Jln Binglu Utara, Kg Meragang, BT2728, Brunei	f	0	1	2025-12-05 02:29:14.820173	\N
365	Alex	Ang	alex.ang13@outlook.com	d0e028741dbffa6ce772efd1f545a061aea65c9b0d2471dfd27c7a6caf40f60f03f9c48417aa2d2c5bbfc6b3610c87e75227fec3535f58f4b3a8a5828a0206b3.79847d2a6e0c65381713d20f69f8ce14	7163377	RPN KG RIMBA	f	0	1	2025-12-10 05:20:13.344511	\N
366	Muhammad Asrulsaini	Asnolfadillah	aramonzai@gmail.com	d4565d0f14221cbc2c8b63aa9e8f1f18a3ee2831072ab75e3bcfa13c5dd7948a7850f5480c745f20da1582ec0e5c48a0838c2c128cca070135599ad5b1ace39d.dc2d8ea70b931a53444d139586f94b7b	+6737112415	No 52, Spg 80-55-22 Rpn Kg Pandan A,Kb	f	0	1	2025-12-19 06:10:55.710879	\N
92	Yudy Firman	Haji Manaf	yudyfirman@gmail.com	aa93455dc4f22e8ca19e64fc68679d1d733ce042aea95c6543e77354cb2875938a33a3c089d3991237d3d6cae2fe01d892a704a76832b611506a98431536c541.a1628bc3c028ab8604b1235b5caf3b94	8856170	No.6, Spg.525, Jln. Pasir Berakas, Kg. Lambak, Brunei	f	0	1	2025-03-29 15:03:53.416351	2025-12-28 08:59:16.582
379	Lambak Branch	Admin	cucixpress.user.bn+lambak@gmail.com	placeholder_password_will_be_set_on_first_login			t	0	1	2026-02-18 07:58:32.68388	2026-05-01 23:56:36.693
368	Diyad	Rahman	diyad_ar@live.con	b7437ac4a7c032024753dfc75cd1a73e46e378f2d2c603ab748cbb01d60438380e32700b469c1fac41b959786c9ae5a4f7b9d920fca0a7e843d529f1952bcc24.47935b28e4ec54b8aa2d841a2fd26ab4	7222186	No.32, Spg 508 Jerudong	f	0	1	2026-01-04 07:02:23.067371	\N
369	Wiwi		qestwhee@gmail.com	1w2e3r4t5y			f	0	1	2026-01-08 06:42:05.751863	\N
370	Siti Waznah	Awang Dris	sitiwaznahdris@gmail.com	f621438411744fd8fea46099e599fb7f57806aa479e622c9114d5d441a63597b1711c9c679bb3e6ee827bcf6badd4299071c75e18d7647693d066d3689aa8f84.cfc79cf7c77ef0954c93cf1441e3df9f	8624418	NO 30 KG BENGKURONG	f	0	1	2026-01-10 01:36:13.019402	\N
374	Qamarul 	Hazwan	qamarul.hazwan96@gmail.com	6a6cb143156a0504af89ecf2345189f1832174b5a8833d1eaf41aa51785811b9b19d4b7d6098e713872291e306b91a729c4aff49c2161900556febbce74d9d99.7a36eda1db37ccaaa8aec072c5989e49	7108974	no.8, simpang 479-54-12, Jalan wasai limuru	f	0	1	2026-02-14 07:05:20.902938	2026-02-14 07:06:02.924
375	Adryan	Wong	ryan.wong32@gmail.com	ee327c4362da3762e57d8d28422b0e2e54dfa412c482d776f1b9334f6e8d7a908b1663709d84abba9387064edb457bdf10b21c5c6ed51de2e40ab32872589f6a.beaf922c0e0ec216d51993391249ef0c	7471368		f	0	1	2026-02-15 05:45:27.496763	2026-02-15 05:46:38.212
372	Kim	Hung	agwy@gmail.com	8ed4c308c1826cd812144e5fb39a12af5681f2a79525917cdd8c45b38e6c1e1fc5c7756574d5303290eb65faf4b34aa6bee19e1b425300a64c579b92297da3b4.a7e184e2eab13b3cef5c6ffa241beb74	7192754	No.7, bengkurong masin	f	0	1	2026-01-20 01:12:33.201813	\N
373	Aziim	Hussin	silber2057@gmail.com	afec278c09b02bcfecbc2252b80392b8536f204a23d69be923c7910fb19cbab5ead0253d78454fb1bb75ba6e13bcf912f745f4a367169755fb9edb4cb114ade1.a8339432d26f2bf8d667037053224d80	7128432 	No. 63 sepakun kecil tg maya	f	0	1	2026-02-01 01:43:58.370593	\N
376	Ah	B	communityportal@outlook.com	a7847923421bbc1e0df59ca67e4f074812d9c710f55757a55ab4fbdb28f90084b563041d313be86557705ba4dfd7edb32b988a91e41c71073e3b0fcae6c6cdb1.f85af7be95c0aba42597ea6c8d7c3f04	8886990	Kg mata	f	0	1	2026-02-15 09:43:51.998448	\N
377	Ezaa	Awang	ezana.awang@hotmail.com	16dd4164325d14bafd55a9aac34b173a0faef48f088c1cd3cb148ef2f25980ae4210b641381fcb7e95a5044b6bd18e3d6b82e7aafe082f0398dc94d6fa4983fd.2a670111ae334e3782ee2449566b3967	8893181	No 3, Spg 73-24, Kg Sinarubai, Jln Sinarubai 	f	0	1	2026-02-16 08:46:06.595917	\N
378	Ezana.awang@hotmail.com		Ezana.awang@hotmail.com	Fuizana25			f	0	1	2026-02-16 08:49:35.159154	\N
367	Amirah Haziqah	Abu Bakar	mzyqah@gmail.com	d6ca7fb9cd0f8ac9abc59ad48d4c4f59da905bcf941999838269d39f15b5a1d0f3b586023427814481fbf1731eb4f3727b917ad75232e208ed0ce99bcd004d21.0e253fc8c18a120b80022224ba7c25d7	8117756	Kg Tungku, Brunei Muara	f	0	1	2026-01-03 04:02:43.386828	2026-02-22 03:22:05.955
380	Test	User	testuser@gmail.com	4b413ad81db322a0c6f0fd03a40083ec642417b4ba6a25d0c943f55c98525bc1fbc6a78b2fa6d311d172aee08b9b8c9e6518152945d17c6ff74ef7cea34b7d4a.7ebd9e7d04d516d0a9dc35fed533d6b3	Not provided	Not provided	f	0	1	2026-02-18 08:11:47.20986	2026-02-18 08:12:19.855
357	Patrick 	Z	azri.patrick@gmail.com	37a5704aded3eaf297e6801463e074fe26983b46383f80a7a190d4f6e75351a3e3bf1afb1b0b01a82bf5af472db33960b9abf81c884184b2351b5f0b4cad6f1c.48429c58950573db4f50fa241cd891f5	8861502		f	0	1	2025-11-12 07:22:07.249085	2026-03-18 00:46:20.037
381	Azryan	Julaydi	azryanewam@gmail.com	1cff1342c97c142810956952e7aa9c3404afbde2da0a378d0da8ae6218af2c79cc36af0b8ee7f3f075c7ba9a153ba6bed83b145372b4a0b91cca4842e7e11994.2a15dff704723e657882743bafc606cd	7151621	No. 4 simpang. 55 Kampong Bukit Udal Tutong	f	0	1	2026-02-25 04:08:22.307508	\N
382	Ahmad	Majid	raihan318@gmail.com	2f6f1a62f5da2d9524070d118bf2d7556cd43012193b5d76f9d30f41f45bea9452824f92b3b83a0826ecc9340de63ee3117c6781bbc7a879219f045fdc494535.4e0fb9c4fd6ba4bc5a7f07b8562964c7	7216211		f	0	1	2026-02-28 02:29:37.218039	\N
383	wafaa	jufri	waf-67@live.com	7862407efa981307cf27f1ec7078dcd7515bd7cee75bc7c89f599d25c910c7560f9a401869922e66696d23b7f4230ff5b27365a07295cc64d8188267ac1703af.22f44c2676438a7fee21ab06278c35b8	8871845	Tanah Jambu	f	0	1	2026-03-01 07:52:59.654985	\N
384	Fauzee	Hj	fauzeehajimoksin1912@gmail.com	19121990@zzZZ			f	0	1	2026-03-03 06:09:12.434775	\N
385	Deeb	HJ Adam	deebzirul@gmail.com	ce7efb13ab09a96507df7c18aced43def0f63775dff444dc79405936c7b3cb83a417ce80959b0a5deb55baf4188b2f39775f85725d122c9caf67e1e4d101c524.629e28d92503d11901454dcd5ccdf282	7109315	No 29 spg 55 kg sinarubai 	f	0	1	2026-03-04 03:15:11.777752	\N
395	Marliana	M	yana.m1001@gmail.com	f2257bb7dce1b2fd02de33c3c2d675a55e3a8a596365db84cfbdaa7767f1b1fb2bf191f581073506fd6621de14eb14bc1ffa4c8369f94acc2025711fee8b6cc1.bcbd124af740e95bb8b87c85228dec9a	7326379	No. 21, Spg. 85, Jln Bukit Bintagur, RPN Kg. Panchur Mengkubau	f	0	1	2026-03-14 06:08:17.296494	2026-03-15 07:36:23.638
397	Haji Safri	Ag HT	hashat89@gmail.com	6cc331a159fd221e41b847a0e69f6f06dab1a4d2fcc42669e8cc451a162e4024623670a19747f07aba80605d47e9f6bf9d003f55ec13b775d667dbbd03fd409e.c0d7639665220785d823fb32bbada90c	8907997	NO 14 SIMPANG 2055-97 KG JUNJONGAN	f	0	1	2026-03-16 23:31:18.74834	\N
386	Eddie	Effendy	mranarchy201@gmail.com	5d4ef4865279e20fa1d9b3e4a3ecc1c6ef753e210603a9a947bbb112e189c4c73056429b4889ce142003dfc02f26db7aee80d57342ce2257f9d06bd5caa5cf09.7a4ad71d4c634dc1d67945feccf15af5	8977052	Brunei muara	f	0	1	2026-03-08 03:30:21.764407	2026-03-08 03:54:49.471
387	zakiahzakaria013@gmail.com		zakiahzakaria013@gmail.com	sotoladarindu			f	0	1	2026-03-11 04:12:31.409906	2026-03-11 05:57:05.166
389	A Faisal	Abidin	af5602@gmail.com	ad48a2854e57648dc28888863ad3d203378044e5d12cc412b600fa22a59f4c31aa0bcee63b1749d54582126d5e5f8bc39446535df60b4770b2a74c88b36b410a.2a938a0daeb5b37e068f40ad318a3ce8	8898066	170 Kg Lugu	f	0	1	2026-03-12 00:09:28.934782	\N
390	Ady wafiuddin	Morshedi	ady422@icloud.com	1b05d648dbd67131caf41f52e08809a5f4cd26538935cdb46ccf0cd7d8556c779fcaaf797d5ecd279ab4cf50638d875b335dffaa0fe979d9cce1526c6a61eedb.264a26a72e2f8a1327cee470fbe4a8b5	8874555		f	0	1	2026-03-12 07:01:56.407732	\N
391	Adrianajamil		Adrianajamil	alaipunya			f	0	1	2026-03-12 07:33:02.015082	\N
401	Khairulanwar	Jefri	anuar-19@hotmail.com	4e566cdfbf59765822b45d68345a9ffa97de65aa0d7c10abf3853db4601cd82f18911556ce73503273a30661ae064ad7c06716422f84e44b8418d871a5ddc853.65a04dfc11c87d2760aceabc70163fed	8675848	Flat klas f, BLOK A, Unit 2A, Spg 53-36, Jalan sungai Besar, Tutong	f	0	1	2026-03-19 04:06:40.963879	2026-03-19 09:59:46.864
398	Rose	Izyan	roseizyana1903@gmail.com	fa71194ddb5ab11fcb2ae203ff28beb2cbfcbcea223edba960e25caad94d38acb8f9be7360bb0e98babd816ca4a9cb3404d1bb96f45f2d23f8f7f1783cfcd2bd.cc7771cf91e38c858f2b42539cabcc3a	8175014	No. 6, Simpang 372-25-17, Jalan Singa Menteri, Kampong Mumong B, Kuala Belait	f	0	1	2026-03-17 04:26:12.9773	\N
399	Syazwani	Adi	wanyanyanyan@gmail.com	8c86db394e1d58c7dc4cb8c5296fc5c369073ff87d3428d8df56b6bcc1f71d1a3ee303aa2ae088d831113761f66692167abbeb982697227c4bc1c7cc38a87efa.146d15aac35494a29d990f144e77d0bb	8179803	Kilanas	f	0	1	2026-03-18 06:19:13.672304	\N
404	Ameerah	Rusli	afarahiyah@outlook.com	a88e146c6d1c77a7eeff602d75f200b6393846620bd49a2beebb752a246fc8885918ff6c9ff500bd2bea304f0939c0f89eb534ceba24cc04e17dce38cc19212f.ec810311b26041cf07d4da8a262d481d	8131999	No. 2, Spg 278, Kg Kulapis	f	0	1	2026-03-19 04:26:48.886476	2026-04-20 09:09:50.224
394	Raziq	Sofian	raziq.sofian@gmail.com	67c5db929b8b712be94eb0fece9949bc4c069dec3fd29e221b499863b8162406a7092580415117e870dbbaaebed35f1b7e9389f438c08c0ccd303cb0a943e80d.3b844d1575c4e8335c2484842aace31b	7108515	No.9, Spg 696, Kg Pengkalan Mau	f	0	1	2026-03-14 04:32:06.562937	\N
396	Aina	Abdullah	aina.pbwork@gmail.com	1f32faa1d838b4e31d38dd1e1785af7197a9e956464827001d4fd02756bff21680511cce4a3ebd9bc690eed439005eb87a94a5bbe9da866fa6ff5ebe36756d9e.636b5657d469323cbc3b7c146c295028	8623494	no.11, spg 205 kg penanjong	f	0	1	2026-03-15 05:34:40.090522	\N
400	kahar5		kahar5	jatie273			f	0	1	2026-03-18 10:10:14.717278	\N
402	Normahazri	Noordin	yuri-783@hotmail.com	205c36bdb29eba00ba7e1b8d51b3bc6177b073b7e3744ae2360369bddf899a5f0c916030382f56ec93059c2541d26fdeb540d05e989d421376bf213186a156d5.b7a8ccf50fc2a6707a91f6430980080b	8315095	Layong, Tutong	f	0	1	2026-03-19 04:19:51.711419	\N
403	Siti Saralina	Mohd Azize	aleena.saraa@gmail.com	c8468c7912e09bf3ddef08535c889ceddcdf75d8205cd01058620b0664556f0316ec55c3747f9669f5ec4cfa53dfb346fef967d8f743ef826cf41593a4a6e2b9.12b4e068c964008c6db3d7c5966c921d	8930389	Serusop	f	0	1	2026-03-19 04:23:56.103753	\N
406	Miss	Izzah	ms.mysaera@gmail.com	22b8de47102c3a883976bf1ddbb271bc71173f1574a2ac3d161d859b7513fc5633a00171429d866e25a6af69361f26bd23f4da40bb5ce4e0266d682681b1b8fc.b28ceee9401dfb7691745510e9e31343	7204810	No. 1 Spg 1579-26-53 STKRJ Telisai Tutong TC1345	f	0	1	2026-03-19 05:10:03.138019	2026-03-19 13:13:26.446
405	alyynasara		aleena.saraa2@gmail.com	Saralinaa9101!!			f	0	1	2026-03-19 04:28:55.565326	\N
408	Rayyan	Ali	rayyan.aliyusof@gmail.com	power.2000			f	0	1	2026-03-19 05:35:31.672238	\N
407	Rafie	Rahim	raffie3110@gmail.com	f5552cea415e1ea4398070b105695eeb84e8fe98568f6cb415e45876fd822775a8e15b047e4275b9ca5117f66ce756a7dd9585e6d61c42e7635c72f543c0d139.1de0960d5ace610e7ce02ee6de4aa0cd	7284422	No.12, Spg 595, Jln Kasat, Kampung Kasat, Mukim Lumapas, BJ1724	f	0	1	2026-03-19 05:16:17.695423	\N
409	Amal Aqilah	Puasa	aqilahpuasa80@gmail.com	1eb8d3ef2a30e2cfe696759075ed0c2f06df90bfa7ccfbc9316edd5da30762272cc1d359d5791830b869cd8fa013dcb8ceb89cf8113898707677592de47aa954.5c13ef69602335237d6fe60662752318	8224762		f	0	1	2026-03-19 05:37:18.886485	2026-03-19 05:39:01.026
410	Safwan	Haminuddin	safwan.haminuddin@gmail.com	37e166a8e1f1b9175c2ca2ba4005d95c160363ab06a3b3f8a3266e7e928466cd52f0ac02553829958b7ab2004661ab52878371f31b5fdd50d5be84c5091268c4.bfb4aee7a7c369bc58ba23560873f580	8291851	Telisai, Tutong	f	0	1	2026-03-19 05:44:47.198677	\N
392	Dayana	Ali	dbatrisya48@gmail.com	e1ead2b18b46eb54209f8578a5777b7546c1026f3ff166d33c6a2e04e5b45966c9a00ad45d2262a79f8625430300a6310e0efbc220679014db43d4239fbe4d2c.eee76de1408d6fae7bcd8c11cece69fe	7447622	No. 7, Spg 32, Jln Lubok SIgurun, Kg Mulaut	f	0	1	2026-03-13 00:18:09.548182	2026-03-19 08:04:29.349
393	Muhammad Firdaus 	Sadikir 	suadrif277@gmail.com	d9d8eb6090dc32ed79f9f5a8322d471e6e578535be45bf0497ce6f0c9d08f2a29a44e5ca0c888cbdd203ae96561d49388a316323daa30e7b8238172b50aa7efe.14eb42007d2e174eb971e377e1673f3f	7199543	No 123 jalan bujit dilou Rpn bujit beruang Tutong	f	0	1	2026-03-13 01:10:54.065377	2026-03-19 14:51:04.475
428	Asyraf	Asri	asyrafas356@gmail.com	63d05a1156f51e8d256565d732e482333e315ccf82abece5a458dda875f52b7a3a9325b8c74c925a9a880bcb8855e59a614056900b15c2ef8a60860bd70e908b.5c873fa2cc7fd919cbf4f824499ffa91	7253356	No34, spg 105-12, Jalan 99 RPN kampong Rimba	f	0	1	2026-03-19 09:44:16.995348	2026-03-20 02:00:06.268
426	Nabil	Fikri	nabil.fikri256@gmail.com	3cd3eda608a073e2f4880f5ec8e0dcabb59e5805ee8ca0720f07e1a71b7f0bb38e14df691bf41971821f69ef9e5e66613aaf7f3ca67effd7773e5353af75ed22.a58971cf841c000658944ecca6021c54	8867514	No 115, spg 124, kpg tagap selayun	f	0	1	2026-03-19 09:35:26.921528	2026-03-26 12:12:27.474
414	Mama	waga	pengiranabdulhakem@gmai.com	Buy20sell26!!			f	0	1	2026-03-19 06:19:08.798408	\N
415	Rasyiqah	M	mulrasyiqah@gmail.com	f50c3d87ded3583388522f19a48e5a118ee256dad74a8cfdd019c19ab878c01334892e9473bbc4cd0f99fda3cbbff64fb426adb9981d0e3512e6a676df7c5a5f.c01b5176cf8b97aa130494c7361befd5	7223668	Rimba	f	0	1	2026-03-19 06:21:14.460378	\N
413	Abdul	Qawiem	qawiemsyakirah11@gmail.com	f9cf73344b94081c770845d572e5873fe9154eeffca0389d0962dca755c9e47f5495897e0fdd089dfd91adeb4389dbe768b4d18bffac34d75f79d21a0e4d09d5.d854eee7cbe6462de1823d00864d69d3	8962082	No 3 Blok D JSKLL	f	0	1	2026-03-19 06:13:44.114195	2026-03-25 00:44:13.87
417	Nur Hidayatul Aeny  Alisah	Zullizam	aenyalisah@gmail.com	4c7381408d26bfc6d2a2f81b9114facbda4673b01afbeeac8a5db1a9ff95172e3baa93c2b794526fb461033071fdb7d505cb68b0214bce73e3660e1ea0e510cf.f7c4e6bf9aed7d4ba6f50d01808ca2d8	8770029	Mulaut	f	0	1	2026-03-19 06:55:19.418108	\N
412	Naqibah	Ahmad Bukhari	naqibah.bukhari@hotmail.com	2a35beaa5818785fd6ba1cac662ae50f6b8cdb73479c2f82423e94090ce5c2f5b9d1db781b24ae3da75b5ee9d334cb1371db276026d6a4d232ea610019995386.fad252c003c04c4ccbae34a416d1d2d9	+673 813 7688	Pangsapuri Othman, Kiulap	f	0	1	2026-03-19 06:03:43.085072	2026-03-19 07:10:29.697
418	Mila	Rah	kamilah.rahman@gmail.com	Kamilah258.	8892478	1	f	0	1	2026-03-19 07:03:12.363276	2026-03-19 07:14:32.575
419	Jida	Mn	majidah.mdnoor@gmail.com	676c87cb4fc121836ffbc51b228e9aa203cf2fd0d50474a0d2489c51f718d74513bbd023d6bd52bb3be5a57d0f5724b9793aa51e7eb1b726f69ded243148600c.b94be486902ad804bcc039db46332d08	7447890	Block C, Higher residential apartment 3, 2nd Floor Unit C4-2 Simpang 204-9-68 Jalan Utama Mentiri Kg sungai Akar	f	0	1	2026-03-19 07:32:26.644991	\N
420	nadd	yhm	naddyhm@gmail.com	588038b00cf6525ed777f8ce957e6fc9ebd1d4d14eea1f363e39c3f8cd5778edbc8fc4a6c15e1b616fa378fb8e54dcf093aff2387727ecb9f1e96a925033ce8c.0ccb7af9dfd48954275349773ce01bdb	7119991	Tg Nangka	f	0	1	2026-03-19 07:43:35.132368	\N
421	Bahrin	HI	nadyabahrin99@gmail.com	07168258f1becab71ebf6b5fb7efbb863b00b12f8e5fe4a99a426953621b665f2fa23327060623c4755f85e3c807b625fd1b5543408b023e07e8e9e67744fb57.dae58b01694e817c69b299940a9ee075	8618364	Kg Lamunin	f	0	1	2026-03-19 07:51:08.340127	\N
423	Qawi	Rosli	qawirosli@gmail.com	a3c930b2071151c61bd95c3d6750eaa40870dfeac4acc61bd63a91453f083888b9f1f112b41bce099477f7ee1d95b8192ea7d0392560e8ebbaa36370aed26ecc.da0a05432108f871ef1b306a3f0b61b7	7115539	Rimba gadong	f	0	1	2026-03-19 08:08:21.676259	2026-03-20 01:48:50.186
422	Abdullah	Hj Kasim	dulsaf2630@gmail.com	33e020aaf2d1836f14498b075aba34dee3d79ab66f31249ccbbda37a75e37e7060d21fad76869f0b7b8516bc6751e58239a4c29b148765787cc31c5d419fa6b8.01b1b873dd49ceacc9ffb2e8c53e7658	8262953	Kg Sungai Akar	f	0	1	2026-03-19 08:07:38.692626	2026-03-19 08:11:17.974
411	syer	ilham	syahirahilham@gmail.com	6db9ce166dedc9316ea22e7ded0ec3e7f2855245bdf20800a56cb07285e6087abd304daa476faa3f9036d84e782b5a56ea057f002270ccfc8f0a80cc620044b2.cbccc212afa95e6da4dcfcd558b5fa5c	7332302	Tutong	f	0	1	2026-03-19 05:59:03.72119	2026-03-19 08:20:23.916
157	Mirza	Hamsyari	mrzhmsyr24@gmail.com	45622ab66a420e6ff50b407ae0037e38db163c8dce02f8d9110c7fbdc2d06080c7e47e469ec90c883a6ca8b80e65c744644985125b8f68a01bf2fb858dd591e6.39cf5e91d47db29b5e516452c2b541b0	+673 8653247	No.8, Spg 34, Jln Pengkalan Pinang, kg penanjong tutong	f	0	1	2025-03-30 06:03:23.22609	2026-03-19 11:42:47.799
424	Qarina	Juna	qarinajuna97@gmail.com	e50d5837b46b8ab3d349ecc3bb30a1eea36e25f389279bf42aa3291ee9d7874941056d0482bc7da261ac9bc88fa4189b06235d3de28dbd7ab832c762764fd49b.51a971201cfef840320f2177c64bb3bb	7253133	STKRJ Lugu	f	0	1	2026-03-19 08:56:40.678866	2026-03-19 08:58:46.266
429	Faizah	Marsidi	hayatul.faizah@gmail.com	3cd74654eee199b8c180322d775f6bf2e3893dc71a096ede3948986100a49cb1f74d48a0fba4a9627f3c2e68c83887686baaeb1f11b128cdf4e53ace7c485ea2.84751ce15e6fc9700c3e59ff6b580755	7237973	Jln 88, Lambak Kanan	f	0	1	2026-03-19 11:29:14.951583	2026-03-19 12:15:42.231
143	Afin	Matnor	mdafindayani@gmail.com	5e8bbb8a0dae7b69ad4790914dee2ad99d46a163d298aebe15fafb29d53ab5993b6713d532a4d95580cc19515defa63d91ac5209b98864b197327742b5ead386.f54681bb1058855c24b95bf7065b577c	7163802	No. 165, Jalan Mulaut-Limau Manis, Kg Mulaut, Sengkurong	f	0	1	2025-03-30 04:27:48.908863	2026-03-29 02:26:59.185
425	Malai	Rania	rania.mshahran@gmail.com	8c32274d4445867736a63c16748b1dea3d7469514c8f30d89286f05492a1290c9ec88e2de7362033d5812490939c1bdd19ebb67830f0cb59b21388c4b0d32036.b2d2744ec65fd1e9822dd3125bd9cc79	7157375	No: 16, Lot. 8797, Simpang 24-11-22, Jalan Pandan Kuning, Kampong Pandan 8	f	0	1	2026-03-19 09:08:25.500274	2026-03-19 09:47:37.798
431	Azian	Zakaria	azian_89@hotmail.com	5e559841904901e4b65f70f1f5794ea3b042ca59c7daf94853cb2cbd152096eee52fa1f8cd6a0f982c015b121f8e8991e43d50edde54df239aaafe1204fd9fde.a1e6f9894ae4360372153df50df83d82	8673695	Salambigar 	f	0	1	2026-03-19 12:39:37.71674	\N
430	M	Harun	madihah.hj@gmail.com	4ea4b8ff170987f255ecccc3a90eddc10bcb4b739f8c30094a5f2c3dffc24e1e4d4913aeb3cc4f8fc38c5efe55a5c19fea1bf799c06200052643bd0ddfe8adc4.8aa4bdb4aa25e1486686352b9800122b	7112610	Mulaut 	f	0	1	2026-03-19 12:19:34.999367	2026-03-19 12:42:27.946
432	Deen	Hz	deenhz20@gmail.com	b19a299f27d3c2eec6e2c4d3265652ee6969cac5984cf98d0a9aa514cd17b332766d7da38d7e77fff4d88916eeb7041020c918207dc711b10d7a47ccfc07f17d.d27022d4d20d7517d5ac9604c5b39388	8152515	Kampong sg besar,jln kota batu	f	0	1	2026-03-19 12:53:57.326477	\N
433	Azim	Johan	mohammadazimjohan@gmail.com	d4e91e6ba7c6dd4de754cebe55b252aa743aea7be78f45ceb21b2822a7a2737ca3180adf769e61deb372c00777f1afdeb82daf72f2bf836f1a9fa0d08ab7edc8.c8f5c4e0cc60f7ec2317b1ee680bac71	8119234	Selayun	f	0	1	2026-03-19 14:03:04.347622	2026-03-20 11:43:31.823
416	Zharfan	D	zharfan.dzulkarnaen@gmail.com	2e2ea1453d2a448632cef01b3cb1626913ed931395fd52e172a9eb7152ee540af59e7c496d7b8222f9da9eb2b87c733c9a96bca3dac6fe63cedd227fdbeac615.6aa1abe53ec3097d15aa2f64c07f7972	8614909	Tiada	f	0	1	2026-03-19 06:50:25.189391	2026-03-20 13:22:52.002
435	Adli	Razak	adli.razak1997@gmail.com	50f34522d84f2884b33ee64d0b038f857db8df8fa7e5b760dfd572112b42bfd360379c0cd6fad4e844c6d299dfb62d7efe09721b930f454ae77490c2b4fa48e6.bf7a73246872053f58e86ec5d0c854a4	8756882	Jerudong	f	0	1	2026-03-19 21:07:14.820079	2026-03-19 21:10:33.138
427	Nora	Sah	snh267@gmail.com	e5eca9d105c3de75897391817e8f7476081679f8d3bb1d04763e1b4684f2ad51bc965ebba945b04fd94d9dc1387259d8dcbbfa28f1819a4d91d5170a3dc0da19.2b50f337f0cfe92a45c5faa6dcc77f41	8644737	Manggis	f	0	1	2026-03-19 09:36:39.658543	2026-03-20 06:34:19.363
434	Rulkairul	Jambol	arjunrampal82@gmail.com	6fa82d539515994dd10d8a456d69175bfc108896d0804b65e6f3a11072ac3426311720f50fb6d42837802036129fab0a4c1ee60bf7ee5c296e327eae8c5190d0.034584d33ef63052e47a46de66cf8d8f	8672276	No.1, simpang 10-44, Kg Bengkurong.	f	0	1	2026-03-19 15:23:18.661053	2026-04-01 02:30:06.823
436	Aldanny	Suffian	aldannysuffian@gmail.com	babb07baf4d9dbe77c413abacd122155f24c228cc6e71bb4b771c02d627ae74233b6c7298c05da1002997420175ab10e3ed3cd1830919c29bbe69a637ec512ec.2c8ad05a6401f7f08fe47cc924ab44d6	8298121	No 1, Spg 187, Jln Kiqrong, Kg Kiulap	f	0	1	2026-03-19 22:05:57.68375	2026-03-19 22:06:39.591
437	Siddeq	Yussof	siddeq1728@hotmail.com	9207d2107ac48fd292d1d89878c91dfa37cfba05e8caa275d4678629c57e37908bef52b9cbb3b214b3210d1ed65435cb8043cbf30439620df4c39fd8089413f2.d93533811221b15151d6b9386a8e0a52	+673 865 3529	No. 53, Jalan 77, Perpindahan Lambak Kanan, Berakas BC2515	f	0	1	2026-03-20 00:02:34.960788	\N
438	Zame	Zainal	zamezainal@gmail.com	3d77411542bd09d2f7f7b0e9ca928e37a513765f743ed7c6255bbf985c88dfaf1fc5cd0c502cf5b1272bfd23f269aa6d34fbd3d963a823a4e72ef513165ed28c.be3b62cb083911e00cc7094a74e08437	8858678	Kg Kulapis	f	0	1	2026-03-20 00:37:17.71839	\N
439	Nurulaisyah	Marsidi	nurulaisyah.marsidi@gmail.com	f79e061d5378be9a37272129d4852556050c6c34fbe0379e3cffc42ec6a68e50433fd04bb0b253c65fd5470113a5fa74b445435b551b173ef8640dc989cf10b5.90ce8c846e04f7193d9372efea6b6bb1	+6738632444	No2 jln 88	f	0	1	2026-03-20 00:39:22.082379	2026-03-20 00:41:57.795
440	Norhassanah 	Hassan 	sanahlarks@gmail.com	df55f586da812186db5325eb63fb76d027828d72bf5f3b166854c4fee5c2b7b6a7bb2087252c9967f7062d218b3cbac7a5c4d1e9b74abe2f4800abe5c6ca8825.47a23d9e25bc8374b77a9e16d52b024f	7334263	No.2 spg 835-29 Kg tanah jambu 	f	0	1	2026-03-20 00:40:57.282479	\N
441	I	S	izzah.sallehuddin@hotmail.com	fac6c1067e28f62b59ff1ac649b9f5b727d4d8e4cf8f9c84e9501e32b90c0724484256122cc77a9d00604942e1343e14854bd601d00ea42316382f04d506d358.3147189aab70f5e1b5d0fa9f54acbeac			f	0	1	2026-03-20 00:59:07.817957	\N
442	I	S	nurizzah.sallehuddin@gmail.com	2c032f3061d0863bb3648f3432d61e4bbfd1c03cd499b83ab769467b3d25809dbc89539d168d8cb7ea2291e30598ffc812031600abf1c81dfd6d042a28c4feee.8cc5113f120c71aef8182ba4b3b54336			f	0	1	2026-03-20 01:49:28.770993	2026-03-20 01:59:33.489
447	AJ	Abdullah	alijanah2003@yahoo.com	18a2cb0b8daab0fae3f099ca55dfa0f0afa56106f63abe435a0c115bfa516bbecba70b20f6bc1fc1364ae1d75b04349469dbabfea8a45a1caba401f00c8c36f2.d6996d8e8b7aa3ca70b9bb1c89f918c0	8827470	Rimba	f	0	1	2026-03-20 02:46:19.109561	2026-03-26 04:44:30.013
443	Aaa	Aa	foranychillax@gmail.com	24e76e595b258349fc1d2f65a1c73b093c148348508723736b39fafcb337ec2858d76b1339e366d7652b5d824196e127e1b389e27d2a033169d09ee6a7d336bf.dfab294981daf35d066917180eaf9939			f	0	1	2026-03-20 01:58:41.148689	2026-03-26 10:33:14.851
448	Sensei	Ryuu	senseiryuux@gmail.com	5608aaa9d8b6a3ddbb428529df8bc91d6289ac8151ad6396796bb84d7ccd7681482a78a21e180bb4dc13589f69ee94b491f55ef2c40af12ec8682ecf7bc52d14.4844763f44d2a3cfdf4eda5704916dd5	6738626187	Kg Kapok	f	0	1	2026-03-20 03:09:52.519668	\N
444	Amin	Jalil	aminjalil448@gmail.com	a3fd2309b8874888475651bd279122b3e224c15f85c92aa85ec833f720a2105eb0618a8a7676b45deb73f723a2e53c8527c2384dbcee88ff5d92e34647f21ce1.034e3c0dce493ecf7d332b99769a7fa9	7284804	Kg Salar Jalan Muara	f	0	1	2026-03-20 02:01:24.393754	2026-03-24 06:53:07.214
452	Umi	Roslan	umi.roslan@gmail.com	a947cc7fafad67ffbc9c0bcbf068d9b455436e018033be35d1ac40e1d7d5d06c71b589023cf0c8ec99f702c7b97463d89d868663d6a5481cb51d9b9683ff6164.ade8f7c526ffd7a32dca8f275e5baf22	8855102	Lambak	f	0	1	2026-03-20 04:25:28.659955	\N
449	Arif	Othman	mdarifothman@gmail.com	f4004d7905145939ca521f438685a87c9a7b7273ae40a7e47dd45d9fa1078fd6f6a8fe5d6bad24a01f14a60e2a912fc2ba8665219a973b8506d6ecaf563e1fb3.b5899ed8939949fa969b7f2b2e37999f	8282800	Tasek Apartment Blok B	f	0	1	2026-03-20 03:27:14.913031	2026-03-20 03:32:22.946
446	Izzati	HK	rs1812@hotmail.com	ee978befccdee6918aec6a2000a4dc0a439253a7e600e3f253f12037f149e7a42f2b9618a313100202e96d64b02f43c72a87fd9058373ae737401661870f6ddb.4fe7be633d2822307024a5271f54110e	7370316	No. 35, Spg. 69, Jalan Sg. Carana, Kg. Panchor, Mengkubau	f	0	1	2026-03-20 02:45:03.756063	2026-03-20 11:23:10.899
6	Takzim	Ahmad	takzim158@gmail.com	7fb125c0f68c64d13d5826bf44e7ddab6b92cf6cf041ef207fa525743dcf29821125dec6f69fecf9a3049465dded954c7a1f6db62980068f55fcabac2b19c8ef.e60f18a5e53803c0d78c82ab10326cfa	+6738879765	No.59 spg 1411-43-57 kg sgi tampoi jln tjg bunut	f	0	1	2025-03-17 19:10:02.436344	2026-03-20 14:26:17.298
453	Izzul	Adi	izzuladi@gmail.com	c2293d756f2236df30730d66e93963c0404cf0801c9c08f655cb5d07688e0dee2a2ac2f12a3118826d5dc5fe956c9bfbb8ad9eb363494c35112a61c436ec9b22.dc6223bdc0b10ce8c3af77e688d291ca	8231712	No : 9, Spg 133, Kpg Burong Pingai Berakas	f	0	1	2026-03-20 05:52:37.777759	2026-03-20 09:25:29.214
450	M	J	muqsitj@protonmail.com	f885aad44ca0bc69329cf50772fa494d3e791cca9dec386c248ea267c8be5b8dfc7c36c3ad072636e9fadd68673cb8fc4a3b4803be1d7bcc9cf3f9d5d615807c.977667226a7b7c365063c251e4fe3da2	7103433	Muara	f	0	1	2026-03-20 03:45:28.118672	2026-03-20 11:23:20.724
451	Erwan	Said	erwansaid@gmail.com	c288c49d77128009d88c77767f48118a4cd3d992290bd75377bf62eae275ac65987f6e5a5e017203a814d220cf37d89a3f8697b9f76a54104d8ffa5a0c871c75.b08c40a60e211d461589acb2e490ae8d	8175561	No 3, Kg Pasai, Sengkurong	f	0	1	2026-03-20 04:09:35.482471	2026-03-20 04:49:21.783
455	Vernon	Lee	vernon.1470@gmail.com	ebfcb4dc11dbcd732004634e490e92189374a83aacfaec202cf144211acda35c71b3c6fe9f33328f637c6403a40fdc5ada263ef8f7aa95d8ac8e159a954f84ac.ca38cea9ec48f76e76d6b040a97dd124	8992363	Kg Mata mata	f	0	1	2026-03-20 07:18:12.315626	\N
457	akmal	haziq	akmalmuhdhaziq@gmail.com	826c7e06227faaa814ad27375d06860cc55dbd0f371bf5cc2f7841d997555b226897487cca795ba8e55c766df61d5b5eb167d3edea9a7818e0ea25018d57c14d.171b8684db580afb46b16ff76ea9132a	8792894	Kb	f	0	1	2026-03-20 07:23:24.022823	\N
456	NFKE	HMS	nabew24@gmail.com	300ab8420478e29ec6f49bbe4f80ed8d53ac2a6359a1d8c50adb6a5b1910de712c5288951faf748833425e0d83b94c495032ae30173f558fb17060e537b85994.36687e27338edf7b423df1c5c4bfbb37	8626056	Penanjong 	f	0	1	2026-03-20 07:20:09.451554	2026-03-20 07:20:41.997
459	Zainul	Ariffin	z.ariffin186@hotmail.com	3ce5f2779f263c383ab4be99923af942d664d5071353bf4579a0de61b2e71da0ed6e7636f66120cdfc2b03ea596497dbb9b19cad74a0a1829df495aff253617e.cf7c0d63a0f24a9b9393f4db168e0d54	+6737230048		f	0	1	2026-03-20 07:33:19.229753	2026-03-20 14:13:03.368
460	znol	ht	azdhnazihah@gmail.com	c13e0094bbe7be003f624586478edc307f00b1aba301832759954e05345c652149d8a3209ba0deded92b9bab8b3c271589b721fd2e12b7d4e5b88ba677354c32.bc5e2c2740f0b1812db42ca0d2b1254a	8137978		f	0	1	2026-03-20 07:34:31.85	2026-03-20 08:01:12.596
458	Mohd	Izwan	adrien.izwan@gmail.com	8ee9625adc222c9a47710de75444bf35e39d1960600d1a3373c5244668fb6140e243590058e7d28a6f26bd720d4e14a5ec71a6027407ee5cf243913eb450dead.b831e2ce3eb67689e6ba1181cefecc86	8921529	Mengkubau 	f	0	1	2026-03-20 07:24:01.323168	2026-03-20 08:33:43.658
445	Izyan	Mohammad	izzyhana152@gmail.com	3a08d4d25b7a0338814900b5049ab52bdf3f31ca55c6e3a3e55ce39fc8379e052554987496135da117e5d5171341083ba5a53c60e1b881f493720cee28592f88.e8989160a0e9aceb22541b3d8ef3ff4c	7130349	Lambak Kanan	f	0	1	2026-03-20 02:43:47.948742	2026-03-20 14:28:48.918
454	Yana	Abba	yanaabba@gmail.com	0bdfbd07e7dc6a5a4b304694edec662ae39f6c6fd39bbd40e0e2b19c51e7b3d067a028dc9df17d4e33f8ca5af2fb2358389e332fe87242c17412f38317b0c2ba.96e9e2c2639c6bb894a761a8929b7ce4	8806919	No.27 Jln 86 Kg Rimba	f	0	1	2026-03-20 06:24:50.608479	2026-04-25 03:26:27.878
461	Humaira	Jafri	mairabatrisya38@gmail.com	2e65b2c3e8434db8accc4ca1348478e41ff119b7e07f61e4505b4f35fcecbc78350cd56d257c390e0bb46114ce1d3553da8c842a4d6241d558df0ee859a1cad3.9b2fc6afb901bdef563284ad9a154edb	8760875	No.38A, Spg.602, Kpg Sg Hanching, Jln Muara	f	0	1	2026-03-20 07:34:48.381901	2026-03-20 07:37:27.898
463	Lili	A.	heokwon4m@gmail.com	14d3b258ea2f46ad4d06e3570e9876ad620cfe262c765539374667f7963a395288d22a86d8f967d1591cbd498f20bb0eab92b55a7f6eb6de2e7437e9168afb24.c88ec21fda3a3136bbb8547a629b96a0			f	0	1	2026-03-20 07:47:06.669598	\N
468	Hafiz	Saedan	hafizsaedan@live.com	8d698c229b6599139cc35bf5c1ec16064e04cde70f83d8544aa5f4f6f340dabb17ddd31a2c0eeed4c8a5fcdceea6f41256f9088eb6fa89c8ed462d5faea290c9.62e953329d88ebdf581dbcfd59df1544	8616346	No. 31, Simpang 326-61, RPN Kg Serasa, BT1728	f	0	1	2026-03-20 08:13:12.469684	2026-04-18 06:25:12.078
464	Muna	Munirah 	munamunirah2626@gmail.com	b9bfae46f5d1470cb04e419401e2d05e592728e02293c361a1316d17fc9d6d02799f71febaf25d3717f489813189d344ce187948c84ee15750d9c5edc8f28ff3.8b406df59aa66b5f005f91b3030e56f6	7120955	NO.12 SPG 415-25 JLN WASAU LIMURU RPN TANAH JAMBU MUKIM MENTRI	f	0	1	2026-03-20 07:59:43.432294	\N
465	Waie	Manap	mwaie.manap@gmail.com	7f2d5530aa94693de6eb1fe9df44dffb2d8e5aeb634896b767d55db8bfcdabf0525375e32d9a42844f7acbb4f27655ec5434605b7cb9c1991b9fb5e1c9235605.8ff829625676d0bf451cac66194bfa30			f	0	1	2026-03-20 08:07:46.845556	\N
466	Habib	Rahman	asmanaslan2333@gmail.com	a4a5989234bdc32f89672a7c9d2bb2e7ae52cf97223eadf8e3eb1cea50ca297cf2f2f4bc68c7b29b3fb4974922a047543dff224a1902d1e10ceaf72b5b3fc833.271cd6920a13f3cfbbdf67c61826ae61	+6738292333		f	0	1	2026-03-20 08:08:21.673497	\N
467	Atikah	Hj Kula	nurul.teekah@gmail.com	911fe1b94bb5d475436693a8489ae709784bb0d507ef936bf408036dfcc334ca0a72c735db1d4d254a9c0bfb8ed0d6b6b9ccdcf16bc587d2373aee460dccef62.6c086f28c75e80414fc02666cb70d759	+6738991598		f	0	1	2026-03-20 08:10:23.170895	\N
469	Nuruljannah	Jumat	jannahjumat@gmail.com	a6cb0ef087a1207d89919ce18644ce41cd9869010578c6818d8d9efd7bb1a1ee43ba5990d3ea769e7dbb4db5d5a01d9a186c4c8034fd9e8d030b7fe793755759.21220c4f2d02fb1d6b484091eee8ff89	8808642	No.12, Spg.82, Jln.39, RPN Kg Rimba	f	0	1	2026-03-20 08:23:00.117806	2026-03-24 10:52:05.774
462	Farah	Hisham	farahhhisham@gmail.com	4acc2c05dffeef9e676d11782541510882340cb03729463236e1a6d6c6cc309b3ed7b29daa237c82dd997bfeb32b51483677a66f4576b3be8c9ceb0c411b465f.2de99c464e87326756cdbefedb5f4437	8953003		f	0	1	2026-03-20 07:39:16.868878	2026-03-30 04:10:08.972
475	Azma	Zainal	azmafir@gmail.com	d9ff9a4f5ba90a60a90070fb2cfde2a8e21c1c786c40d4f3604a6f224f9a63577ba58fabdf12435c196aacdf66b825c4c3e1410f6965b2a45588aa7fc27f5f9b.d1d389350323b17f602347efce0508a8	8912419		f	0	1	2026-03-20 09:12:11.668618	2026-03-20 11:32:49.143
471	Tazul Nurizam	Timbul	tazul.n3@gmail.com	36c1ebd0a2131cb5bf62cd87e4d2d2c6315e4cbd745b1cda77427a12f0b6ccf18cfef408225878775be8d01d83df2ab9e1a9ab38b90c3fcae38785cb9aaf5058.b1a8962e64782dea4c326d8b9c94fda5	7273326	No.69, Spg.670, Kg.Bebuloh BH3323	f	0	1	2026-03-20 08:54:56.44957	\N
473	Sufi	Hasmi	mdsufi.hasmi@gmail.com	7d1fd71934ef3b2a1024e5fc6b851fb57e57945ee594181e9a1649948436a27ff597ae05695028d075e7e9f0404ec940c6c02642ca5994a94ea689251b05aaf5.5324cb4b0f9d5af6e2eb5cf64c1b65d9	836 7467	No 13 Spg 18 Jln 60 Rimba	f	0	1	2026-03-20 09:07:03.310692	\N
470	Nur Aziyah 	Hj suhaili 	jeeyah1220@gmail.com	e7bf4b847457700c016c4762907b07ba4906b65636d9ae041b33c539c3dbef3989f58d3db20a77e493145e5c61b7fc4824c2e0e27c9b0b520585bf571cf39919.a5026cb9679a1c5cb8657b8f4e89bee8	+6738662394	 Jalan Kecil Tanjong Nangka	f	0	1	2026-03-20 08:26:25.337807	2026-03-20 11:28:49.966
474	Rizaluddin	Masmulyadin	fifteenrizal@gmail.com	482e10e851a50c73e136f4438f6d8c168a957edcff987f499646feb93008aeebeeb6292272e3bf2d7de31fda650592626bc157c9c9f36127e30d83941950aaff.a5e3281414373d8b4e5233b37383e7fd	8196560	No.28, Simpang 155, Jln Kamangsi, RPN Kg Meragang	f	0	1	2026-03-20 09:07:14.591469	2026-03-20 12:54:18.216
472	Nasri	Matali	nasri.matali@outlook.com	111432fe1c3f5fd68add452864e3726b431d9ae805f14925530ee3d55ac0e13d4fb949957cbc6ec7456346b3f0a571bd78aa5116ad10c5689172eb34c8567bae.dd861dc9a833b613e43115253ed16514	8228618	Junjongan	f	0	1	2026-03-20 09:06:54.317328	2026-03-20 12:54:56.031
476	Ali	Ibrahim	ali.ibrahim118@gmail.com	08474fcca09b4839fcc3da8c828a398f36adfb2a7c6b1d50b9d502e58899ed2fe27182f21b12c589ddb5454e10ba04b726fd29044b4cbeb77413e8583a30549c.9d7f07672e29ff0604d9353b08f631f3	6738157262		f	0	1	2026-03-20 09:33:13.415834	\N
480	Rafidah	AT	srafidah3@gmail.com	a50539050129e360c105818e2e7f9b8784029dfee4f058b14293c3d696b753b1ae57095589033e4c6d260abbdb8c0f24b3c7b8c8b4fbaa71868c5778cc46bedd.c23322527d6d295ac2264c30773eece2	8267622	Meragang 	f	0	1	2026-03-20 09:46:36.797484	2026-03-20 09:47:27.673
482	Nabilah	Pungut	nabilah.pungut@outlook.com	15afa2efde49b4e719af5843d34ea41e720c9ca12e727e938eda6285d64aa7434b636f2f229920eaae91f1c590acde403ce3545050d6a162fe18f221d92093eb.6f0e171359ee2250845224eab5a5abdc	bella@BBC218		f	0	1	2026-03-20 09:48:21.82925	\N
483	Hj Ruzairi	Hj zakaria	ruzairi712@gmail.com	844d20e5fcce1bdb4a6c9fb359823f4bbb010d6646bb28d78cba09782820d475546694feba0d76bc5f714e37ca366b6e4c119b8d32b3c5c454380d91b483f5a9.6dab2f48f660d82a3154bd544e2abe7c	8822996	No. 11, SPG 637-20 STKRJ KG LAMBAK KIRI 	f	0	1	2026-03-20 09:50:10.376656	\N
484	Aminor 	Ariffin	aminorariffin.306@gmail.com	cdef92b505fe6d9c2704d69bba28f9d42f85fe05559226e0157f49d16155f81ac16e97c3bfc24885b2a6b3a6d0757101a08ca8d73f2682a3bc56f89ce59d7995.1a87babf0de5ebac57cc49ced0a9dfa2	8119925	Spg 183-28, no 6 jalan kamangsi kg meragang	f	0	1	2026-03-20 09:54:28.05052	\N
485	Mohammad Nazri	Mohammad Yusof	nazriyusof@gmail.com	db9e9b4d7c49a9d80877b1ff83c95b7a4f013dc49d6ff15f378b78a5b863dd5771f9438097e87c625b079307f767c1610f04f34f1da910da8375111e882cb85d.2961a61762d442e6f3a153248b7d60d4	8751970	rimba 	f	0	1	2026-03-20 09:55:26.82024	\N
486	Zahhar	Hh	b.zahhar94@gmail.com	a312129968647086874fa475fdaed70afde8914a1b06c9c22946b876b095c16f386fc6670e9ff28e323ff728652fe124d780c6f8b01c68a9161b5ba3db886f31.4c4487eb2152682d1438bfbf844021c5	8893425	Mukim lumapas	f	0	1	2026-03-20 10:00:37.330257	\N
479	Safwan	Hamdan	safwanhamdan193@hotmail.com	306261c52aad1d284a0202d4bfdccb0786e886710a0f6789ffcbdbfdf1dcdccf0f3950158ec3bee4939041ac3846f916e897a1baded3234d335ec8b66509719b.860074a7b08d24f66c09b5d3c6e14693	8814070	No.17, Spg 52-84, Kg Mata Mata Gadong	f	0	1	2026-03-20 09:44:22.038436	2026-03-20 11:11:09.644
481	Fahmi	Ahmad	hmfahmad@gmail.com	963bfabb6f759db0bd3c6d6a7d65b652b68512aec6159cdf4d39cd32014c15793b152fc235a62a6101aec6e9b83813f4506c660dc50b4f8252f1e07cdfb5fbde.e7883167b4c4d5212c21121556d39a13	8624679	Berakas	f	0	1	2026-03-20 09:47:27.265834	2026-03-20 11:00:35.002
477	Mukhlash	Aziz	clash.184@gmail.com	5df29d1cd82196e3a3a038d2d84ce5b03cd5f68a1160a432201cec42709befb8a82e0178813f102f10ccbb26c4bce7147cf1a544c61c997437db10e774454381.910891025f726b5ffcecd78171c54440	8121484		f	0	1	2026-03-20 09:38:46.655397	2026-03-20 11:57:53.005
478	Faiz 	Osman	faiz.hhashim@gmail.com	5c8fa07ec974d70b02d1e34d50a5329e2d9b51256968d3a41a2373300904ed89cbe49e767a5c8fe37dc61f90061fc84dc6b1875ab553801825c7b9a89e5f8b5e.6931754857da18e2e1e665788d86abeb	7124808	Rimba 	f	0	1	2026-03-20 09:41:28.983483	2026-03-20 12:01:10.799
487	Mohammad Hafizzul Rizzat	bin Abdul Wahid	rizzat.wahid@gmail.com	68c7e1521d24488a24ce8fecede3e1d244ce12a1d08dfec1515032a087c312a5aab155e6f235d727f6fd5867811da5271c17d6ca27b9f9e5a7996d81b25c3b36.99b8ca8600d985cdcd74aa54e23119ad	8341204	no 212, kampong bangnukat, lamunin	f	0	1	2026-03-20 10:06:50.006407	2026-03-20 10:07:44.219
488	Adib	Adam	adib.adam0212@gmail.com	64729b108fa781e84857ce2e47c3c59e98d63b7748dc027c0e699be1aef53c39064fa5a0b474fa962f145742a9aeb77ba7db100a7c2f8b9a19022016192c88a5.6b931e2a59b709094ac154ac27961431	8202224		f	0	1	2026-03-20 11:02:15.432402	\N
489	N	Haron	husnina7106@gmail.com	c850faf69fd24294798d8b9c97d6e3251804e7bdcb107d2d2d4499fea1d257322f719c08b66cfa454b5b76e27235df9aba5bd008934f68a87f3f1e2c49b3cbcf.abf1fe3b8298a64b18ae1c7ff7fa536b	8113443	No38 spg99 kg okbi	f	0	1	2026-03-20 11:04:14.612811	\N
491	Natashia	Ismail	snsnatashia.ismail@gmail.com	9352cd33aa95e654e4f74037d89a207a6192b5191fb1b8d3434d44c3aeec573bd790e432b8eaf37b473832fd5d96995a39e91c8b2daa9ec3b7a4f2e19cde983e.1bc1e7bcd7bc6abf98752eda7eb8f4a8	8676610	Kamangsi	f	0	1	2026-03-20 11:07:40.732061	\N
490	Saadah	Z	saadahhuda@gmail.com	2f8755705487c1db9e3629eeb67b7adb613a384874a66f8d8189fd2bc48b664ea89a42b4f0f88220bf23b5ff5ab05297987327c4f210ffc1e65ef89cd850de08.7c7b6f7bb2c95cdc8edaded180eecb2c	6738935529	Tanah Jambu	f	0	1	2026-03-20 11:06:21.698741	\N
493	Ayu	shazul	shazulayu17@gmail.com	5aabba878268cbbf24d0525a1f5f1a8caa2d70c893178d213642a7aa115a4102573c0469b1aa74f226cadbc48f71c8b95e60dc4f2f139115fd63cb1357754c72.772b472eb81c4c1d7939eb670288852d	8850073	No, 11 spg 396-93-141 kg jerudong mukim sengkurong Negara Brunei Darussalam BG3122	f	0	1	2026-03-20 11:19:32.284175	2026-03-20 11:21:53.564
495	Akmal	Amin	akmalhazimin@gmail.com	242ce4214a2d6871aba46956809ba8b4f93f483cdad30097c15e19d82ba20061fd6f6f96c1e18e841cc945655887833b309904956638584efe334a89bdc460e8.712f37c24866fba70dd0203975a9f515	7280174	NO 858 KG LUMAPAS B	f	0	1	2026-03-20 11:22:57.623413	\N
512	Amirah	Ishaq	lailatulamirah@gmail.com	65cb81068e2b048be84c5a87ae1b9081b3dfc097636cdf2f4b33171e704722f38797dfa524f8d4497060a93b891fcb954f20d9ffe464fa69e87da9e22e6dffbd.687201c07c732a13fe52e1cc3d1444b1	8300216	Spg 183-28 no 6 jalan kamangsi kh meragang	f	0	1	2026-03-20 12:41:35.1977	\N
492	Akmal	PR	dknurakmalkhairunnisa@gmail.com	e69598c5beae1366b2bd90db0ba6c682a69a1a98238aa7a2ac312902f43e8de528349030c9b70ee0f14b0ea46e4e31b84a2dea08a245cb984f228db3216296d2.b938cfa69618bcdd4c56379a7dff96ac	8890358	No 18, Lorong Seri Setia Satu, Kg Perpindahan Mata-Mata 	f	0	1	2026-03-20 11:15:24.311923	2026-03-20 11:26:06.231
496	Sai		hjsaihs@gmail.com	634ced8238cc07ac892c658804908f791c9328edc656bea46b534f225e70b29b31b98a0062c2bc1dbf42eeed710276a6f3ca2d62889f8b648384b1cc96e5da34.a7df4efcd460e354d4b0c15f9f151463	7362576		f	0	1	2026-03-20 11:29:03.263775	\N
497	Hasinda	Musa	amlhsnda@gmail.com	97c643d232f737c193cf882148ceaf2ad121ebc39d2194a1bd9ce40e81d38d1e9afaa1f293809b92ba3b74fa0a331f50cf9275e88e5d5dc1c5316830eb1ecb93.63c24faaafa6edf46182cc8ce55b2d63	+6738258317		f	0	1	2026-03-20 11:30:36.245075	\N
498	Wan Izz	Izz Zafir Alawi	izzafir@yahoo.com	135983da6618e9aa18daeb9308c9ba61870b797eae43f7bdb2188eb7582bc165e8c233be5987c6363f0bcda4461f6fea8300f997a4a99e1d088fe4e4fe4212b8.183203eede1b92e5015c6e5f70327d0a	8757645		f	0	1	2026-03-20 11:40:28.762477	\N
499	Munirah	Isa	amalmunirah.isa@gmail.com	977b7bb356baf1e1214e4abc5609379e1bad3b515ba5fca68d5dc2727a5dd51dccc1387928a3579ac84180e140de02d460d415a75af50e7b9a17c1790cc58aa1.73235f4a80db99a4c839e94785eaef8e	8819591	Sengkurong	f	0	1	2026-03-20 11:43:56.93683	\N
500	Mohammad Asmue	Roslan	mueroslan@gmail.com	d4e5be12c580d89fa97591e31ef1a346f7e616f1b58c9da0460ea4ee051716e7e305a3646b35830f087864ab54a3ae664b94a590657db6c937e43e8212c75b06.eef7f18f185292dece5c15832beedca6	7320457	Rimba Gadong	f	0	1	2026-03-20 11:47:07.891166	\N
501	Izzan	Kadir	izzankadir@gmail.com	fee4e0c3edcfcc1e606f21044cd72c343c3a1e852efc374d50d9371356b8b3d6f3cb92022ae305db785f45ddf76228a6a84a763d69f68bcbc099942dc87e4b4e.7f696d6cdbb42be8163590d461134578	8621820	No 7, Simpang 52-80-25, Kg Mata-Mata 	f	0	1	2026-03-20 11:50:10.960478	\N
502	Liyaa	Nfz	liyaa.nfz@gmail.com	08e9a72b51e8764f972a8444a84b802b2e884049e6045ecf1bcde2e0a4062d508abde6cfc2118ad169de8dbaa64be2986046cdbaf357ac72c624c20d3e0f4078.3a7dad03795b65f4032c0bfb185df01e	8795745		f	0	1	2026-03-20 11:52:43.161932	\N
504	Yasmin	Ahmad	yasminahmad2053@gmail.com	fe70adaf64c11e659b7eab88ca8a8e5f3e26a61d9c5442c6bceeb3545b4b36eddd9d494bc377f33b0de4a8fc1185e60a9fae131478cab23f8a2874ae349900b3.1717ada1cd7762cba0bead32ad1c5aaf	+6738742053		f	0	1	2026-03-20 11:56:16.38057	\N
505	Nurul		nurul.aini1705@hotmail.com	d8d8c6668fbaaddf4a37077524b6a3ae57668fe16aa871e25c6fbbb0463b8be95827f2347320d165029fc489d97984affde589d0abc4ec27aeb7f52c75f5e050.449fd78b44c414001c623ca933d65a04	8608752	Kg mulaut	f	0	1	2026-03-20 11:56:46.483117	\N
506	Sabrina		atseelah@gmail.com	ebc4055ea0b3d6adddec11d9399e6fd04b2dfc45f85d6a4cb9b4a6f79c747c937d252456909acda81843aef6cbb00295ab56f7c27b4a250dd3da9bc12d8af619.93e9252b907534ceb317ade7cbbc9f8e	8755665	Brunei	f	0	1	2026-03-20 12:13:32.72873	\N
507	Nina 	Zndi	amanina.zunaidi@gmail.com	90455c6eb9d6ee7a07d078ea397b80310289b25c58cd9f0273b354228e02327b890d814d032df9952dc62d14f83b6d470253cc1459b589a99fd362780f5c4a3e.95711850dd0f3f170593beb34ed7d40b	8973134	-	f	0	1	2026-03-20 12:14:15.299946	\N
508	nadiah	azahari	azahari_nadiah@hotmail.com	d7c681c9feb63b13e96b603ec3e9e1d411ab1a2f56cc5fcf7572eeedd3499fd2b6ecc9db0f035ba29d66a1ebf5d0ffea0ba9954c2d41c65d571b27d87b164f1b.66ab2752aafbca386427e528012aabdb	+6738168861	kg kiarong	f	0	1	2026-03-20 12:24:32.501148	\N
510	Najiah	Abu Bakar	najiahbakr@gmail.com	66ee4c83a628252782774e42b85f089764d7a9d7b8b408a116d4752ba59cf1d82ff0432018682f55840a8cbff83e118fdca66456fb6324f6568c1ac7206487aa.3df6811dc5962578bad752ce37f91fdc	8935659	Jangsak 	f	0	1	2026-03-20 12:29:02.709361	\N
509	Azad	Rahman	azad.rahman@outlook.com	c37b2a9471e0cc8a6e4a199d16ea0c2b2e71bd85dd0abd175e31bb9953c944ce6e27b665073346c4bda17205e6cced7713e9353a3deef303cac49458bab95283.6d07d51b77d4c88a8809b76feb50308e	8134965	Mentiri	f	0	1	2026-03-20 12:28:19.586289	2026-03-20 12:33:27.939
511	Warni	R	warniroslan@gmail.com	46bde62418ac675f7511bb6fb1d1a62669ff06a8de9462a570914aa920d2bdcd6a036a62ea5b3c124a82b0879d8ac52086798dcb8877ef247c4549571dbf4acb.977d1d52cd786c15e7f6aa6803cc9e87	711 7424		f	0	1	2026-03-20 12:32:51.592455	2026-03-20 13:15:00.49
513	Zulhilmi	Zulkefli	zulhilmi1.zulkefli@gmail.com	0bc8b3a3de5aafddc6f26952e92eb9255e11db0132a7a129eaf76fa9ee61695f997023f8ca28502bb761851776f6d89d15238ebc22844225c8475a808cec07f5.650891a51b3d8164689b3f7968af3c11	7163856		f	0	1	2026-03-20 12:44:43.398386	\N
514	Amiira	Aqilah	amiiratulaqilah290402@gmail.com	9ddd8a3d54b223f5def60e238bbf567c749ef9553510eb0f9be7057561d2b2bb989bf4703033ec40c8d0be8e9ad75cbddc1847643f657a396d8360715ab191d5.c70262c3166ff66eec7bf05c2d93866f	8302119		f	0	1	2026-03-20 12:52:01.704296	\N
494	Amirul 	Ahmad	mirul791@gmail.com	69470ed7a1f2b23f44f6bb2a86f75387ec21b6aef99d501d8c9d74e6c889652652d16219fed6c472de0bb6f8e04367912b34ca27b9e5ec8fe7512ec18f6ef3a3.0b191cd5804fcd688bce898d49bf8a02	8824075	RPN Meragang 	f	0	1	2026-03-20 11:22:43.188819	2026-03-20 12:36:27.158
515	Anna	HF	farhf2324@gmail.com	1701bb9b635364da9965c77076222f187462117dd634ff727ba1177efaa93a2ea58bbbdf670bbe49fe16ac379a5bfada44ffb2dd161c42742ebe05456ad4ba3b.7f4c0c948b36e2c10f9e1333b9e53c96	6728263324		f	0	1	2026-03-20 12:56:08.659823	\N
503	Nazri	Idris	nazriidris203@gmail.com	131c7a5bfa7ad0ebf22c17cc4de7685f603239cf222227b84e98132b9230ec7cb22d6c03a79c360610636983cf25a604750c59ac4b94249e4667b6a42a829973.e2cd5f1e1278a2e0db14dae5929e5385	7234328	No. 27, Spg 1369, Kg Batu Ampar, Jln Muluat-Limau Manis	f	0	1	2026-03-20 11:53:49.2055	2026-03-20 13:15:12.764
517	Nurul	M	nrlmjdh24@gmail.com	efa66d51ce2ec7f257ca26ec2d9ebfcf48e536cb2994ba42d3e1a1bd0c5fe700d4656e9eb04a486c3c59b18f0e44c2aa13e2f4d2ca315d82e5e56d72abba7d19.aaa55f81603a886ed81840c3afc08136	8810928	-	f	0	1	2026-03-20 13:22:52.534181	\N
519	Carrie	Embran	carrie.embran@gmail.com	34f7c4d946c80a95a213247a1fa120c0cfb13f926b2840f13fe42868a61d0918d483c899f0e58581882dd21d8a9b7ac486bf87a53f1b4da86711bfe2f1d7c57f.9250f9e1d7e5e50f0cf91e32fa521306	6738738381	Mata mata 	f	0	1	2026-03-20 13:35:20.527696	\N
518	Dally	Yusof	dally.yusof@gmail.com	6ab046068ec3d6f4b3099d9b24975f9cd6199dcd3437f91ef431b2713f9ed344ad397df2572f38096e18b84adac6cc55ab14f4ae7c262d175fcc9d3766c87e52.6e280850f219274ea530f3907c5bc231	7201271	Salambigar	f	0	1	2026-03-20 13:25:22.753155	2026-03-20 13:55:27.63
529	siti nurarifah	muamad	missreffamakeuparts@gmail.com	90869558dcbd3154d666a6a556ab1f43a33dc1030e83d3d5f39e84eaef91c2db4484b8682ffed9d8e18226b69763254a014dc16a21f616cfe5006d22563c05b0.bd6715f9a3b52cb20c676fe801d31038	8147894	No.115 kg wasan	f	0	1	2026-03-23 03:15:58.749562	\N
521	Fakhri	Junaidi	1555confide@gmail.com	00cdc17d520f5cab9cb39d57b4040433f0e63402900f65af2a83bc588450719f9ce3a7376773b9c4737586ecfd3564e7a61839b91732e081ff73b2071ed89a12.79a4661820884675c5d9e20fd1551e7c	8771978	5 Simpang 52-6	f	0	1	2026-03-20 14:24:31.286571	\N
522	Lorraine	Tan	happygal21@hotmail.com	df9163c29844d86043c716f70dc56603b75eac1c2bc337735f5469807f673ecfb95fd050418113799bd5a468b47b9d63350bcb52076245b99e313d9bb41697a6.78c0be307f6a45f02b8bd75210f918cf	867 3451		f	0	1	2026-03-20 14:33:34.457512	\N
523	Nazurah	Roslan	nzi5218@gmail.com	f8d20135b8a139cc24550a37613b0246488d3e13e04801c1e2697d3169d9678c56efe8ae2a64eece979dff63ac08c485373f9be67c32ae5d2055731d66e337c9.a741ada05687c9610918a90d8a4f80a8	7141839	bandar	f	0	1	2026-03-20 14:34:31.53491	\N
524	Zed	Z	babyzed1612@live.com	87fd55541154285827d829a08fdf51164386da047d586c82fd975b32ee1f3afd9941829a38285766e84d25adf2ba7f3c7f4eaf96f5d5e898c80e8f3b1ea16254.2daf7ebf1619c45a1b831056f4c3638a	8811255 	No. 18A, Spg 554, Kg. Salar	f	0	1	2026-03-20 14:37:24.897574	\N
525	Ahmad	Fadhli 	fadhli10@hotmail.com	f394afa34b0813f8da1b460d0650c214ba1aedf473e7daa280b42a7db5944ba71f8d98749b16abebe425bb7f82623e145f9ade6dcd9517d352a2a132dd8e5e8a.b3d4b323b5c22d3f618332b0f5080d34	8755920	Tanah Jambu 	f	0	1	2026-03-20 15:09:31.679251	2026-03-20 15:11:14.562
520	Mijan	Yassin	hamizanazizi0811@gmail.com	38d9f0df6420e8e2df44ae5ccd4604a7fbc172817fbd1b1b2c78fa140786c7befd7a0386920868dc2e8872ef02a1291807a7678554e60127eb7621a9fa3b7edf.e56ebc6d94b4dc2f37041ec9efaec52c			f	0	1	2026-03-20 14:08:58.363774	2026-03-20 15:28:47.543
526	Yasmin	Haris 	yasmxn.hanani@gmail.com	8a83409552bc3895b22c4c0c685245304bb1db6157c3f978e3806c4190ecac68a3ceea3e3526859886cdb5af75236b17d26981e5017f1bf8a8d70eb9fa50793e.0c8af1740419e244c57f80263be85bf7	7371550	RIMBA	f	0	1	2026-03-21 04:02:09.983302	\N
527	Derick	Chua	derick_chua89@hotmail.com	697c77aa1f039dbac4e72c152a4a6655d684f686eb2b7624d92e03c18c12cdfc708567e64e58a707296d7f6fa06cde0b074b6c0c78f4aa72e1e2c7e81e8fd33b.68469db97c34e6c485622d1f39ec2a76	8666161	No 2, Simpang 845-15-3, Jalan Gadong	f	0	1	2026-03-21 04:57:20.477246	\N
516	A	Sufi	asyraf.sufi@gmail.com	08b8cfac4e3b6e63f2002e432698ca6edf196daf718d485ee1d6cb03a2577cc17ca65f2cbbc7badc82870b115e5141981e15e4b8ce12502410b412547dc5e0e3.1c544b1c89735c89b95d19fdb8e70eda	7227456	No. 15, Spg. 823, Kg. Jangsak	f	0	1	2026-03-20 13:13:44.284027	2026-03-23 02:28:25.63
530	Ali Rusydi	Muamad	eddy_1912@hotmail.com	6017e900dfdbb6bb52f8a09d2856966dfd0006810caa9eaf6c36365adc1a4e9fe3c2bea7409ce0c534d36da0fb591d2d67de95192ed0cc806610f7dc35b7a503.cbf940764da853e0900a3fdaec8a49ed	+6738606554	No.115, Kampung Wasan	f	0	1	2026-03-23 03:18:19.364414	\N
528	Shalehah 	Abdullah	shalehahaa@gmail.com	17662d9e5065ff2ca64462e8b5ba5350dcd3276c082bba0374c0231f3ab1df6bfe0974542530c5dfe28684680dc232e6ec7321f28150503e366e5334ce26f4fc.55aa17cfd5e7c0e08b33d59ca79198da	7331800	Seria	f	0	1	2026-03-23 02:55:55.515579	2026-03-23 02:57:48.446
531	Hasliza 	Binti Haji Sapar 	haslizasapar.balance@gmail.com	5970d8bb7601a1ff5377f2f00b90a924df1386d6772ee83421dd97ae2e984d2231d12e81015a03db341c5443a8a33b1204f4d814d7c2837c37f0145912de673e.90737a080c75c2ec8a5575d329e933b2	8177479	No 6, Simpang 112-6, kg Anggerek Desa Jalan Pulaie, BB3713, Negara Brunei Darussalam.	f	0	1	2026-03-24 10:28:38.805473	\N
532	Zee	Ams	hazyshazy@gmail.com	ha46z!y89ah			f	0	1	2026-03-28 08:33:00.238698	\N
533	shahirahbakar		shahirahhjbakar@gmail.com	Hbhr241272!!!			f	0	1	2026-03-29 07:43:09.129052	\N
534	UMMI	HAZIEMAH	ummihaziemah@gmail.com	16031999			f	0	1	2026-03-30 09:39:18.404559	\N
535	Adeb	Har	adebrby8769@gmail.com	93116302bfe01062a6a202117a901743217f208b5a3060b336320569c5b9986dd96bea2d57dc9f268ea80a6d14dee7f64dc070380e1242cb379a1844eb3bd3a9.123e79d30578250982bf74ec4cc16790	7222740	Kg Bebatik - Kulapis 	f	0	1	2026-04-01 06:41:30.005619	\N
536	HidayatPHN		HidayatPHN	Bbmytvv_288			f	0	1	2026-04-03 22:58:28.29007	\N
538	IQZAL	HAMID	iqzal.hamid@gmail.com	bd45b8b468baabd3c3c79d50688685ac3f51066e5acf4839132f8de201001241cbd4493009c0630d677ce0c7340e6c525c2797b8dcc38322d59136c06b7c6c54.1e7ccf3fb945c9621d197aa57f1aa28e	+6738118181	Mentiri	f	0	1	2026-04-05 02:14:44.462182	2026-04-05 12:02:58.827
537	Ak Nur Hidayatul Khairi Wahyuddin bin	Pg Hj Nordin	hidayatphn288@gmail.com	a19faf71418fb904d7f5cdbeee28aeb87c636473c01fefab88ebfc391803844fd00220d8a0f2987137b66f23bd5cb4ab558c273d5553640195cade51aad62932.1a908881063052c462999bc8efa796b7	8991653	no 12, simpang 120, jalan wasai limuru, RPN Meragang	f	0	1	2026-04-03 23:05:40.230858	2026-04-04 01:10:13.52
539	Hanisah	Isa	shn.isa@icloud.com	581c53fccc29ec96466ce1ee0c8be38d068c08b8d11df49d9a4e52607ceedcd88607e4dbaecdfc03388a3ea700e0811d78b74ab3f73dcebdad4c854c5ba8898e.3fe2baee1b1125c3b5c3801b418b4fd8	8729810		f	0	1	2026-04-14 01:35:23.634482	2026-04-14 09:05:30.475
540	Fizi	Safar	hafizimd19@gmail.com	2c7ddcbb6915bd8cb917fd09ccd049ee0608a05ebf3bf4d35f734380c377ade9d316c03fb95f13ca20edbce46936d9fbd60b266a804cd5ee22a4cb771502f7b3.d4a5849e896cd566e0b69f026adaff98	8800816	Ban 4, Kg Mulaut 	f	0	1	2026-04-18 00:03:28.691813	2026-04-18 00:04:30.944
541	Nazihah	Sabaruddin	hszihahhs@gmail.com	6bcb0f6ea72e52b5aba8e29984fae296cd58b5e77ce49921c2c91a714c84ba31ac71eca952dd5dc860a4e24322bc35eaa20e2199508a033bcb462cb189930433.5d0605acc073276d50b9acbff6f0a785	8793627	No 19 Spg 106 Jln 99 Kpg Rimba	f	0	1	2026-04-24 01:48:09.810279	2026-04-24 02:33:34.46
\.


--
-- Name: achievements_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.achievements_id_seq', 1, false);


--
-- Name: branches_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.branches_id_seq', 5, true);


--
-- Name: cars_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.cars_id_seq', 572, true);


--
-- Name: collaboration_submissions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.collaboration_submissions_id_seq', 1, false);


--
-- Name: service_history_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.service_history_id_seq', 1, false);


--
-- Name: subscription_signups_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.subscription_signups_id_seq', 1, true);


--
-- Name: user_achievements_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.user_achievements_id_seq', 1, false);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.users_id_seq', 541, true);


--
-- Name: achievements achievements_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.achievements
    ADD CONSTRAINT achievements_pkey PRIMARY KEY (id);


--
-- Name: branches branches_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_pkey PRIMARY KEY (id);


--
-- Name: cars cars_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.cars
    ADD CONSTRAINT cars_pkey PRIMARY KEY (id);


--
-- Name: collaboration_submissions collaboration_submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.collaboration_submissions
    ADD CONSTRAINT collaboration_submissions_pkey PRIMARY KEY (id);


--
-- Name: service_history service_history_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.service_history
    ADD CONSTRAINT service_history_pkey PRIMARY KEY (id);


--
-- Name: session session_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_pkey PRIMARY KEY (sid);


--
-- Name: subscription_signups subscription_signups_email_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.subscription_signups
    ADD CONSTRAINT subscription_signups_email_key UNIQUE (email);


--
-- Name: subscription_signups subscription_signups_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.subscription_signups
    ADD CONSTRAINT subscription_signups_pkey PRIMARY KEY (id);


--
-- Name: user_achievements user_achievements_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.user_achievements
    ADD CONSTRAINT user_achievements_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: IDX_session_expire; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX "IDX_session_expire" ON public.session USING btree (expire);


--
-- Name: cars cars_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.cars
    ADD CONSTRAINT cars_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: service_history service_history_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.service_history
    ADD CONSTRAINT service_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: user_achievements user_achievements_achievement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.user_achievements
    ADD CONSTRAINT user_achievements_achievement_id_fkey FOREIGN KEY (achievement_id) REFERENCES public.achievements(id);


--
-- Name: user_achievements user_achievements_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.user_achievements
    ADD CONSTRAINT user_achievements_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: cloud_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE cloud_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO neon_superuser WITH GRANT OPTION;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: cloud_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE cloud_admin IN SCHEMA public GRANT ALL ON TABLES TO neon_superuser WITH GRANT OPTION;


--
-- PostgreSQL database dump complete
--

\unrestrict HZejZ6A2amnPC2KiMadiZejX9hBXqA5AugJ03D3RQxQKzeViIcEPvCJatXrhKP0

